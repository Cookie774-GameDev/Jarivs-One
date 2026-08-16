"""Signed Twilio inbound webhook and one-time-token media stream handler."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Form, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from twilio.twiml.voice_response import Connect, Gather, Stream, VoiceResponse

from .audit import get_audit_logger
from .auth import caller_allowed, get_pin_tracker, mint_call_token, verify_pin
from .billing import (
    MAX_CALL_SECONDS,
    MIN_CALL_SECONDS,
    bounded_elapsed_seconds,
    estimate_call_cost_usd,
    get_billing_service,
    Reservation,
    remaining_call_timeout,
)
from .bridge import get_bridge_registry
from .config import get_settings
from .pipeline import CallContext, ProviderKeys, build_pipeline_task
from .security import (
    canonical_request_url,
    mint_one_time_token,
    validate_twilio_signature,
    verify_one_time_token,
)
from .supabase_client import get_supabase

log = logging.getLogger(__name__)
router = APIRouter(prefix="", tags=["twilio"])

def _voice_reject(message: str) -> Response:
    response = VoiceResponse()
    response.say(message, voice="Polly.Joanna")
    response.hangup()
    return Response(content=str(response), media_type="application/xml")


async def _valid_twilio_http_request(request: Request) -> bool:
    form = await request.form()
    params = {str(key): str(value) for key, value in form.multi_items()}
    return validate_twilio_signature(
        get_settings().TWILIO_AUTH_TOKEN,
        request.headers.get("x-twilio-signature"),
        canonical_request_url(request.url.path, request.url.query),
        params,
    )


def build_media_stream_response(
    *,
    call_sid: str,
    user_id: str,
    from_number: str,
    reservation_id: str,
    max_seconds: int,
    outbound_reason: str | None = None,
    outbound_context: dict | None = None,
) -> Response:
    settings = get_settings()
    token = mint_one_time_token(
        purpose="twilio_media",
        subject=user_id,
        call_sid=call_sid,
        claims={
            "from_number": from_number,
            "caller_preauth": True,
            "reservation_id": reservation_id,
            "max_seconds": max_seconds,
            "session_exp": int(time.time()) + max_seconds + 30,
            "outbound_reason": outbound_reason,
            "outbound_context": outbound_context or {},
        },
        ttl_seconds=min(settings.BRIDGE_TOKEN_TTL_SECONDS, 120),
    )
    public = urlparse(settings.PHONE_JARVIS_PUBLIC_BASE_URL)
    ws_url = f"wss://{public.netloc}/twilio/{call_sid}"

    response = VoiceResponse()
    connect = Connect()
    stream = Stream(url=ws_url)
    stream.parameter(name="media_token", value=token)
    connect.append(stream)
    response.append(connect)
    return Response(content=str(response), media_type="application/xml")


def _reserve_inbound_call(user_id: str, call_sid: str):
    reservation = get_billing_service().reserve_bounded_call(
        user_id,
        idempotency_key=f"twilio-inbound:{call_sid}",
        max_seconds=MAX_CALL_SECONDS,
    )
    if reservation.ok and reservation.reservation_id and not (
        get_billing_service().attach_provider_reference(
            user_id, reservation.reservation_id, call_sid
        )
    ):
        get_billing_service().settle_call(
            user_id,
            reservation.reservation_id,
            actual_usd=0,
            actual_seconds=0,
            status="released",
        )
        return Reservation(ok=False, reason="usage_unavailable")
    return reservation


@router.post("/twiml")
async def twiml_webhook(
    request: Request,
    From: str = Form(...),
    To: str = Form(...),
    CallSid: str = Form(...),
):
    if not await _valid_twilio_http_request(request):
        return Response("forbidden", status_code=403)

    user_id = await _user_for_phone_number(To)
    if not user_id:
        return _voice_reject("This number is not currently accepting calls. Goodbye.")
    phone_settings = await _phone_settings_for_user(user_id)
    if not phone_settings:
        return _voice_reject("Calling is temporarily unavailable. Goodbye.")

    locked, remaining = get_pin_tracker().is_locked(From)
    if locked:
        return _voice_reject(
            f"Too many failed attempts. Try again in {int(remaining // 60) + 1} minutes."
        )

    if not caller_allowed(From, phone_settings.get("caller_allowlist", [])):
        if not phone_settings.get("pin_hash") or not phone_settings.get("pin_salt"):
            return _voice_reject("This caller is not authorized. Goodbye.")
        response = VoiceResponse()
        action = f"{get_settings().PHONE_JARVIS_PUBLIC_BASE_URL.rstrip('/')}/twiml/pin"
        gather = Gather(
            input="dtmf",
            action=action,
            method="POST",
            num_digits=int(phone_settings.get("pin_length") or 6),
            timeout=10,
        )
        gather.say("Enter your phone PIN, then wait.", voice="Polly.Joanna")
        response.append(gather)
        response.say("No PIN was received. Goodbye.", voice="Polly.Joanna")
        response.hangup()
        return Response(content=str(response), media_type="application/xml")

    reservation = _reserve_inbound_call(user_id, CallSid)
    if not reservation.ok or not reservation.reservation_id:
        return _voice_reject("Calling is temporarily unavailable. Goodbye.")
    return build_media_stream_response(
        call_sid=CallSid,
        user_id=user_id,
        from_number=From,
        reservation_id=reservation.reservation_id,
        max_seconds=reservation.reserved_seconds,
    )


@router.post("/twiml/pin")
async def twiml_pin_webhook(
    request: Request,
    From: str = Form(...),
    To: str = Form(...),
    CallSid: str = Form(...),
    Digits: str = Form(...),
):
    if not await _valid_twilio_http_request(request):
        return Response("forbidden", status_code=403)
    user_id = await _user_for_phone_number(To)
    phone_settings = await _phone_settings_for_user(user_id) if user_id else None
    if not user_id or not phone_settings or not verify_pin(Digits, phone_settings):
        get_pin_tracker().record_failure(From)
        return _voice_reject("The PIN was not accepted. Goodbye.")

    get_pin_tracker().record_success(From)
    reservation = _reserve_inbound_call(user_id, CallSid)
    if not reservation.ok or not reservation.reservation_id:
        return _voice_reject("Calling is temporarily unavailable. Goodbye.")
    return build_media_stream_response(
        call_sid=CallSid,
        user_id=user_id,
        from_number=From,
        reservation_id=reservation.reservation_id,
        max_seconds=reservation.reserved_seconds,
    )


@router.websocket("/twilio/{call_sid}")
async def twilio_ws(websocket: WebSocket, call_sid: str):
    signature = websocket.headers.get("x-twilio-signature")
    signed_url = canonical_request_url(websocket.url.path, websocket.url.query).replace(
        "https://", "wss://", 1
    )
    if not validate_twilio_signature(
        get_settings().TWILIO_AUTH_TOKEN, signature, signed_url, {}
    ):
        await websocket.close(code=1008, reason="authentication failed")
        return

    await websocket.accept()
    audit = get_audit_logger()
    call_id: str | None = None
    user_id: str | None = None
    reservation_id: str | None = None
    reservation_claimed = False
    max_seconds: int | None = None
    session_expires_at: float | None = None
    started_at = time.monotonic()
    end_reason = "user_hangup"

    try:
        first_message = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
        if first_message.get("event") == "connected":
            first_message = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
        if first_message.get("event") != "start":
            await websocket.close(code=1008, reason="invalid start frame")
            return

        start_data = first_message.get("start", {})
        if start_data.get("callSid") not in (None, call_sid):
            await websocket.close(code=1008, reason="invalid call scope")
            return
        params = start_data.get("customParameters", {}) or {}
        try:
            claims = verify_one_time_token(
                str(params.get("media_token") or ""),
                purpose="twilio_media",
                call_sid=call_sid,
            )
        except PermissionError:
            await websocket.close(code=1008, reason="authentication failed")
            return

        user_id = str(claims["sub"])
        reservation_id = str(claims.get("reservation_id") or "")
        try:
            max_seconds = int(claims.get("max_seconds") or 0)
            session_expires_at = float(claims.get("session_exp") or 0)
        except (TypeError, ValueError):
            max_seconds = 0
            session_expires_at = 0
        from_number = str(claims.get("from_number") or "")
        stream_sid = start_data.get("streamSid")
        if (
            not reservation_id
            or not stream_sid
            or max_seconds < MIN_CALL_SECONDS
            or max_seconds > MAX_CALL_SECONDS
            or not session_expires_at
            or session_expires_at <= time.time()
        ):
            await websocket.close(code=1008, reason="invalid call scope")
            return

        reservation_claimed = get_billing_service().claim_call(
            user_id, reservation_id, call_sid
        )
        if not reservation_claimed:
            await websocket.close(code=1008, reason="invalid call scope")
            return

        from pipecat.serializers.twilio import TwilioFrameSerializer
        from pipecat.transports.network.fastapi_websocket import (
            FastAPIWebsocketParams,
            FastAPIWebsocketTransport,
        )

        call_id = mint_call_token()
        persona_settings = await _phone_settings_for_user(user_id)
        if not persona_settings:
            await websocket.close(code=1013, reason="service unavailable")
            return
        persona = persona_settings.get("persona", "sage")
        await audit.log_call_start(
            call_id=call_id,
            user_id=user_id,
            transport="twilio",
            caller_number=from_number,
            persona=persona,
        )

        keys = await _resolve_keys_for_user(user_id)
        context = CallContext(
            call_id=call_id,
            user_id=user_id,
            transport="twilio",
            persona=persona,
            keys=keys,
            confirmed_pin=True,
        )
        serializer = TwilioFrameSerializer(stream_sid=stream_sid, call_sid=call_sid)
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                add_wav_header=False,
                vad_enabled=True,
                serializer=serializer,
            ),
        )
        bridge = get_bridge_registry()
        task = build_pipeline_task(
            transport, context, bridge, bridge.get_tools_schema(user_id)
        )
        from pipecat.pipeline.runner import PipelineRunner

        remaining_seconds = min(
            remaining_call_timeout(started_at, max_seconds),
            max(0.0, session_expires_at - time.time()),
        )
        if remaining_seconds <= 0:
            raise asyncio.TimeoutError
        await asyncio.wait_for(PipelineRunner().run(task), timeout=remaining_seconds)
    except asyncio.TimeoutError:
        end_reason = "budget_limit"
        try:
            await websocket.close(code=1000, reason="budget limit")
        except Exception:
            pass
    except WebSocketDisconnect:
        end_reason = "disconnected"
    except Exception:
        end_reason = "error"
        log.exception("[%s] twilio call failed", call_sid)
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        elapsed_seconds = bounded_elapsed_seconds(
            started_at,
            max_seconds or 0,
        )
        if user_id and reservation_id and reservation_claimed:
            settled = get_billing_service().settle_call(
                user_id,
                reservation_id,
                actual_usd=estimate_call_cost_usd(elapsed_seconds),
                actual_seconds=elapsed_seconds,
                status="settled",
            )
            if not settled:
                log.error("[%s] call settlement failed", call_sid)
        if call_id:
            await audit.log_call_end(
                call_id,
                end_reason=end_reason,
                cost_estimate_usd=estimate_call_cost_usd(elapsed_seconds),
            )


async def _user_for_phone_number(to_number: str) -> Optional[str]:
    settings = get_settings()
    if not settings.has_supabase:
        return None
    try:
        response = (
            get_supabase().table("phone_settings")
            .select("user_id")
            .eq("twilio_phone_number", to_number)
            .single()
            .execute()
        )
        return (response.data or {}).get("user_id")
    except Exception:
        log.warning("user lookup failed")
        return None


async def _phone_settings_for_user(user_id: str) -> Optional[dict]:
    try:
        response = (
            get_supabase().table("phone_settings")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return response.data
    except Exception:
        log.warning("phone settings lookup failed")
        return None


async def _resolve_keys_for_user(user_id: str) -> ProviderKeys:
    settings = get_settings()
    keys = ProviderKeys(
        deepgram=settings.DEEPGRAM_API_KEY or None,
        anthropic=settings.ANTHROPIC_API_KEY or None,
        cartesia=settings.CARTESIA_API_KEY or None,
        groq=settings.GROQ_API_KEY or None,
    )
    try:
        response = (
            get_supabase().table("phone_settings")
            .select("byok_provider_keys")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        byok = (response.data or {}).get("byok_provider_keys") or {}
        keys.deepgram = byok.get("deepgram") or keys.deepgram
        keys.anthropic = byok.get("anthropic") or keys.anthropic
        keys.cartesia = byok.get("cartesia") or keys.cartesia
        keys.groq = byok.get("groq") or keys.groq
    except Exception:
        log.warning("BYOK lookup failed; using operator defaults")
    return keys
