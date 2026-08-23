from __future__ import annotations

import pytest
from pydantic import ValidationError

from .config import Settings

VALID_TEST_PEPPER = "ab" * 32


def test_phone_service_defaults_fail_closed_with_defined_security_contract() -> None:
    settings = Settings(_env_file=None, SUPABASE_URL="", SUPABASE_SERVICE_ROLE_KEY="")

    assert settings.PHONE_JARVIS_ENABLED is False
    assert settings.PHONE_JARVIS_PUBLIC_BASE_URL == ""
    assert settings.token_secret == settings.BRIDGE_TOKEN_PEPPER


def test_enabled_phone_service_requires_https_public_url() -> None:
    with pytest.raises(ValidationError, match="PHONE_JARVIS_PUBLIC_BASE_URL"):
        Settings(
            _env_file=None,
            PHONE_JARVIS_ENABLED=True,
            PHONE_JARVIS_PUBLIC_BASE_URL="http://localhost:8080",
            BRIDGE_TOKEN_PEPPER="a" * 64,
            SUPABASE_URL="",
            SUPABASE_SERVICE_ROLE_KEY="",
        )


def test_enabled_phone_service_rejects_default_or_weak_token_secret() -> None:
    with pytest.raises(ValidationError, match="BRIDGE_TOKEN_PEPPER"):
        Settings(
            _env_file=None,
            PHONE_JARVIS_ENABLED=True,
            PHONE_JARVIS_PUBLIC_BASE_URL="https://phone.example.test",
            SUPABASE_URL="",
            SUPABASE_SERVICE_ROLE_KEY="",
        )


def test_enabled_phone_service_accepts_complete_security_configuration() -> None:
    settings = Settings(
        _env_file=None,
        PHONE_JARVIS_ENABLED=True,
        PHONE_JARVIS_PUBLIC_BASE_URL="https://phone.example.test/",
        BRIDGE_TOKEN_PEPPER=VALID_TEST_PEPPER,
        SUPABASE_URL="",
        SUPABASE_SERVICE_ROLE_KEY="",
    )

    assert settings.PHONE_JARVIS_ENABLED is True
    assert settings.PHONE_JARVIS_PUBLIC_BASE_URL == "https://phone.example.test"
    assert settings.token_secret == VALID_TEST_PEPPER
