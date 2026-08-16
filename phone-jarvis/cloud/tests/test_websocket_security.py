import pytest

from cloud.config import Settings
from cloud.security import (
    KillSwitchMiddleware,
    OneTimeTokenStore,
    mint_one_time_token,
    sanitize_context,
    verify_one_time_token,
)


SECRET = "x" * 32


def test_one_time_token_is_purpose_and_call_scoped():
    token = mint_one_time_token(
        purpose="twilio_media",
        subject="11111111-1111-4111-8111-111111111111",
        call_sid="CA123",
        claims={"caller_preauth": True},
        secret=SECRET,
        now=1000,
        ttl_seconds=60,
    )
    store = OneTimeTokenStore()
    claims = verify_one_time_token(
        token,
        purpose="twilio_media",
        call_sid="CA123",
        secret=SECRET,
        store=store,
        now=1001,
    )
    assert claims["sub"] == "11111111-1111-4111-8111-111111111111"
    assert claims["caller_preauth"] is True

    with pytest.raises(PermissionError, match="token_replayed"):
        verify_one_time_token(
            token,
            purpose="twilio_media",
            call_sid="CA123",
            secret=SECRET,
            store=store,
            now=1002,
        )


def test_one_time_token_rejects_wrong_purpose_call_and_expiry():
    token = mint_one_time_token(
        purpose="twilio_media",
        subject="11111111-1111-4111-8111-111111111111",
        call_sid="CA123",
        secret=SECRET,
        now=1000,
        ttl_seconds=10,
    )
    for purpose, call_sid, now in [
        ("bridge", "CA123", 1001),
        ("twilio_media", "CA999", 1001),
        ("twilio_media", "CA123", 1011),
    ]:
        with pytest.raises(PermissionError):
            verify_one_time_token(
                token,
                purpose=purpose,
                call_sid=call_sid,
                secret=SECRET,
                store=OneTimeTokenStore(),
                now=now,
            )


@pytest.mark.asyncio
async def test_kill_switch_rejects_non_health_routes_by_default():
    reached_downstream = False

    async def downstream(scope, receive, send):
        nonlocal reached_downstream
        reached_downstream = True

    sent = []

    async def send(message):
        sent.append(message)

    await KillSwitchMiddleware(downstream)(
        {"type": "http", "path": "/outbound/call"},
        lambda: None,
        send,
    )
    assert not reached_downstream
    assert sent[0]["status"] == 503
    assert sent[1]["body"] == b'{"error":"service_disabled"}'


def test_context_sanitizer_removes_controls_and_secrets():
    sanitized = sanitize_context({
        "details": "\x1b[31mfailed\x1b[0m\r\nAuthorization: Bearer abc.def.ghi",
        "api_key": "short-secret-not-matching-a-prefix",
        "nested": {"refreshToken": "another-short-secret"},
        "provider": "ghp_" + "abcdefghijklmnopqrstuvwxyz123456",
    })
    assert "\x1b" not in sanitized["details"]
    assert "\r" not in sanitized["details"]
    assert "\n" not in sanitized["details"]
    assert "abc.def.ghi" not in sanitized["details"]
    assert sanitized["api_key"] == "[redacted]"
    assert sanitized["nested"]["refreshToken"] == "[redacted]"
    assert "ghp_" not in sanitized["provider"]


def test_enabled_twilio_config_requires_clean_https_origin_and_bounded_controls():
    base = {
        "PHONE_JARVIS_ENABLED": True,
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-role",
        "PHONE_JARVIS_TOKEN_SECRET": SECRET,
        "TWILIO_ACCOUNT_SID": "AC123",
        "TWILIO_AUTH_TOKEN": "twilio-token",
        "TWILIO_PHONE_NUMBER": "+15550000001",
    }
    with pytest.raises(RuntimeError, match="HTTPS origin"):
        Settings(**base, PHONE_JARVIS_PUBLIC_BASE_URL="https://phone.example/path").validate_enabled_configuration()
    with pytest.raises(RuntimeError, match="BRIDGE_TOKEN_TTL_SECONDS"):
        Settings(
            **base,
            PHONE_JARVIS_PUBLIC_BASE_URL="https://phone.example",
            BRIDGE_TOKEN_TTL_SECONDS=301,
        ).validate_enabled_configuration()

    Settings(
        **base,
        PHONE_JARVIS_PUBLIC_BASE_URL="https://phone.example",
    ).validate_enabled_configuration()
