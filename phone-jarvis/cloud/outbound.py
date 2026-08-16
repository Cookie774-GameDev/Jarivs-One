"""Authenticated, metered, signed outbound Phone Jarvis calling."""

from __future__ import annotations

import re
import time
from typing import Optional

from fastapi import APIRouter, Form, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from twilio.rest import Client as TwilioClient

from .auth import get_jwt_verifier
from .billing import (
    MAX_CALL_SECONDS,
    MIN_CALL_SECONDS,
    estimate_call_cost_usd,
    get_billing_service,
    terminal_call_settlement,
)
from .config import get_settings
from .security import canonical_request_url, sanitize_context, validate_twilio_signature
from .supabase_client import get_supabase
from .twilio_handler import build_media_stream_response

router = APIRouter(prefix="/outbound", tags=["outbound"])
SAFE_REQUEST_KEY = re.compile(r"^[A-Za-z0-9._:-]{16,200}$")
ALLOWED_REASONS = {"manual", "error", "schedule", "todo_due", "build_failed"}


class CallRequest(BaseModel):
    reason: str = "manual"
    context: dict = Field(default_factory=dict)


class CallResponse(BaseModel):
    call_sid: str
    status: str


async def _authenticated_user(authorization: str) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "unauthorized")
    try:
        claims = await get_jwt_verifier().verify(authorization[7:])
    except PermissionError as exc:
        raise HTTPException(401, "unauthorized") from exc
    return str(claims["sub"])


@router.post("/call", response_model=CallResponse)
async def outbound_call(
    body: CallRequest,
    authorization: str = Header(...),
    x_idempotency_key: str | None = Header(default=None),
):
    settings = get_settings()
    if not settings.has_twilio:
        raise HTTPException(503, "calling_unavailable")
    user_id = await _authenticated_user(authorization)

    phone_settings = await _phone_settings(user_id)
    if not phone_settings:
        raise HTTPException(404, "phone_settings_unavailable")
    user_number = str(phone_settings.get("user_phone_number") or "")
    if not re.fullmatch(r"\+[1-9]\d{6,14}", user_number):
        raise HTTPException(400, "phone_number_unavailable")

    reason = body.reason if body.reason in ALLOWED_REASONS else "manual"
    triggers = phone_settings.get("outbound_triggers", {}) or {}
    if not triggers.get(reason, reason == "manual"):
        raise HTTPException(403, "outbound_trigger_disabled")

    request_key = x_idempotency_key if (
        x_idempotency_key and SAFE_REQUEST_KEY.fullmatch(x_idempotency_key)
    ) else f"phone-outbound:{user_id}:{reason}:{int(time.time() // 300)}"
    billing = get_billing_service()
    reservation = billing.reserve_bounded_call(
        user_id,
        idempotency_key=request_key,
        max_seconds=MAX_CALL_SECONDS,
    )
    if not reservation.ok or not reservation.reservation_id:
        if reservation.reason == "rate_limited":
            raise HTTPException(429, "rate_limited")
        if reservation.reason == "usage_unavailable":
            raise HTTPException(503, "usage_unavailable")
        raise HTTPException(402, reservation.reason or "budget_exceeded")
    if reservation.duplicate:
        if reservation.provider_reference:
            return CallResponse(call_sid=reservation.provider_reference, status="queued")
        raise HTTPException(409, "request_in_progress")

    twilio = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    try:
        call = twilio.calls.create(
            to=user_number,
            from_=settings.TWILIO_PHONE_NUMBER,
            url=f"{settings.PHONE_JARVIS_PUBLIC_BASE_URL.rstrip('/')}/outbound/twiml",
            method="POST",
            status_callback=(
                f"{settings.PHONE_JARVIS_PUBLIC_BASE_URL.rstrip('/')}/outbound/status"
            ),
            status_callback_method="POST",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            timeout=30,
            time_limit=reservation.reserved_seconds,
        )
    except Exception as exc:
        billing.settle_call(
            user_id, reservation.reservation_id,
            actual_usd=0, actual_seconds=0, status="released",
        )
        raise HTTPException(502, "call_provider_unavailable") from exc

    call_sid = str(call.sid or "")
    if not call_sid:
        billing.settle_call(
            user_id, reservation.reservation_id,
            actual_usd=0, actual_seconds=0, status="released",
        )
        raise HTTPException(502, "call_provider_unavailable")

    safe_context = sanitize_context(body.context)
    try:
        get_supabase().table("outbound_pending").insert({
            "call_sid": call_sid,
            "user_id": user_id,
            "reason": reason,
            "context": {
                "payload": safe_context,
                "billing_reservation_id": reservation.reservation_id,
                "billing_max_seconds": reservation.reserved_seconds,
            },
        }).execute()
    except Exception as exc:
        try:
            twilio.calls(call_sid).update(status="canceled")
        except Exception:
            pass
        billing.settle_call(
            user_id, reservation.reservation_id,
            actual_usd=0, actual_seconds=0, status="released",
        )
        raise HTTPException(503, "call_persistence_failed") from exc

    if not billing.attach_provider_reference(user_id, reservation.reservation_id, call_sid):
        try:
            twilio.calls(call_sid).update(status="canceled")
        except Exception:
            pass
        try:
            get_supabase().table("outbound_pending").delete().eq(
                "call_sid", call_sid
            ).execute()
        except Exception:
            pass
        billing.settle_call(
            user_id, reservation.reservation_id,
            actual_usd=0, actual_seconds=0, status="released",
        )
        raise HTTPException(503, "call_persistence_failed")
    return CallResponse(call_sid=call_sid, status="queued")


@router.post("/message")
async def outbound_message():
    """Retired: sms-send is the sole metered outbound SMS implementation."""
    raise HTTPException(410, "use_sms_send_edge_function")


@router.post("/twiml")
async def outbound_twiml(
    request: Request,
    CallSid: str = Form(...),
    From: str = Form(...),
    To: str = Form(...),
):
    form = await request.form()
    params = {str(key): str(value) for key, value in form.multi_items()}
    if not validate_twilio_signature(
        get_settings().TWILIO_AUTH_TOKEN,
        request.headers.get("x-twilio-signature"),
        canonical_request_url(request.url.path, request.url.query),
        params,
    ):
        raise HTTPException(403, "forbidden")

    try:
        response = (
            get_supabase().table("outbound_pending")
            .select("user_id, reason, context")
            .eq("call_sid", CallSid)
            .single()
            .execute()
        )
        row = response.data or {}
        user_id = str(row["user_id"])
        stored_context = row.get("context") or {}
        reservation_id = str(stored_context["billing_reservation_id"])
    except Exception as exc:
        raise HTTPException(503, "call_context_unavailable") from exc

    return build_media_stream_response(
        call_sid=CallSid,
        user_id=user_id,
        from_number=To,
        reservation_id=reservation_id,
        max_seconds=int(stored_context.get("billing_max_seconds") or MIN_CALL_SECONDS),
        outbound_reason=str(row.get("reason") or "manual"),
        outbound_context=stored_context.get("payload") or {},
    )


@router.post("/status", status_code=204)
async def outbound_status(
    request: Request,
    CallSid: str = Form(...),
    CallStatus: str = Form(...),
    CallDuration: str | None = Form(default=None),
):
    """Settle signed terminal Twilio callbacks; non-terminal updates are no-ops."""
    form = await request.form()
    params = {str(key): str(value) for key, value in form.multi_items()}
    if not validate_twilio_signature(
        get_settings().TWILIO_AUTH_TOKEN,
        request.headers.get("x-twilio-signature"),
        canonical_request_url(request.url.path, request.url.query),
        params,
    ):
        raise HTTPException(403, "forbidden")

    settlement = terminal_call_settlement(CallStatus, CallDuration)
    if settlement is None:
        return Response(status_code=204)
    try:
        response = (
            get_supabase().table("outbound_pending")
            .select("user_id, context")
            .eq("call_sid", CallSid)
            .single()
            .execute()
        )
        row = response.data or {}
        stored_context = row.get("context") or {}
        user_id = str(row["user_id"])
        reservation_id = str(stored_context["billing_reservation_id"])
        max_seconds = max(
            MIN_CALL_SECONDS,
            min(MAX_CALL_SECONDS, int(stored_context["billing_max_seconds"])),
        )
    except Exception:
        # Unknown signed provider callbacks have no user ledger to mutate.
        return Response(status_code=204)

    status, provider_seconds = settlement
    actual_seconds = min(max_seconds, provider_seconds)
    if not get_billing_service().settle_call(
        user_id,
        reservation_id,
        actual_usd=estimate_call_cost_usd(actual_seconds),
        actual_seconds=actual_seconds,
        status=status,
    ):
        raise HTTPException(503, "settlement_unavailable")
    return Response(status_code=204)


async def _phone_settings(user_id: str) -> Optional[dict]:
    try:
        response = (
            get_supabase().table("phone_settings")
            .select("user_phone_number, outbound_triggers")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return response.data
    except Exception:
        return None
