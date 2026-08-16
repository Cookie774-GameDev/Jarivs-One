"""
phone-jarvis cloud — config loader.

Reads from environment variables (loaded from .env in dev, Fly secrets in prod).
Pydantic settings give us validation + helpful error messages on missing keys.
"""

from functools import lru_cache
from typing import Optional
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Operator-side config. Per-user provider keys come from Supabase, not env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- Supabase (per-user auth + settings lookup) ---
    SUPABASE_URL: str = Field(default="")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="")

    # --- Twilio (Path A) ---
    TWILIO_ACCOUNT_SID: str = Field(default="")
    TWILIO_AUTH_TOKEN: str = Field(default="")
    TWILIO_PHONE_NUMBER: str = Field(default="")

    # --- LiveKit (Path C) ---
    LIVEKIT_API_KEY: str = Field(default="")
    LIVEKIT_API_SECRET: str = Field(default="")
    LIVEKIT_URL: str = Field(default="")

    # --- Operator-default provider keys (fallback when user has no BYOK) ---
    DEEPGRAM_API_KEY: str = Field(default="")
    ANTHROPIC_API_KEY: str = Field(default="")
    CARTESIA_API_KEY: str = Field(default="")
    GROQ_API_KEY: str = Field(default="")

    # --- Bridge auth ---
    BRIDGE_TOKEN_PEPPER: str = Field(default="")
    PHONE_JARVIS_TOKEN_SECRET: str = Field(default="")

    # --- Deployment safety ---
    PHONE_JARVIS_ENABLED: bool = Field(default=False)
    PHONE_JARVIS_PUBLIC_BASE_URL: str = Field(default="")

    # --- Behavior ---
    AUDIT_RETENTION_DAYS: int = Field(default=30)
    COST_CAP_PER_CALL: float = Field(default=5.00)
    IDLE_HANGUP_SECONDS: int = Field(default=120)
    BRIDGE_TOKEN_TTL_SECONDS: int = Field(default=300)
    PIN_MAX_ATTEMPTS: int = Field(default=3)
    PIN_COOLDOWN_SECONDS: int = Field(default=3600)

    # --- Server ---
    PORT: int = Field(default=8080)
    LOG_LEVEL: str = Field(default="INFO")

    @property
    def token_secret(self) -> str:
        return self.PHONE_JARVIS_TOKEN_SECRET or self.BRIDGE_TOKEN_PEPPER

    def validate_enabled_configuration(self) -> None:
        if not self.PHONE_JARVIS_ENABLED:
            return
        if not self.has_supabase:
            raise RuntimeError("Phone Jarvis requires Supabase when enabled")
        if len(self.token_secret.encode("utf-8")) < 32:
            raise RuntimeError("PHONE_JARVIS_TOKEN_SECRET must be at least 32 bytes")
        if self.has_twilio:
            public_url = urlparse(self.PHONE_JARVIS_PUBLIC_BASE_URL)
            if (
                public_url.scheme != "https"
                or not public_url.netloc
                or public_url.path not in ("", "/")
                or public_url.params
                or public_url.query
                or public_url.fragment
            ):
                raise RuntimeError(
                    "PHONE_JARVIS_PUBLIC_BASE_URL must be an HTTPS origin when Twilio is enabled"
                )
        if not 1 <= self.AUDIT_RETENTION_DAYS <= 3650:
            raise RuntimeError("AUDIT_RETENTION_DAYS must be between 1 and 3650")
        if not 30 <= self.BRIDGE_TOKEN_TTL_SECONDS <= 300:
            raise RuntimeError("BRIDGE_TOKEN_TTL_SECONDS must be between 30 and 300")
        if not 1 <= self.PIN_MAX_ATTEMPTS <= 10:
            raise RuntimeError("PIN_MAX_ATTEMPTS must be between 1 and 10")
        if not 60 <= self.PIN_COOLDOWN_SECONDS <= 86400:
            raise RuntimeError("PIN_COOLDOWN_SECONDS must be between 60 and 86400")

    @property
    def has_twilio(self) -> bool:
        return bool(self.TWILIO_ACCOUNT_SID and self.TWILIO_AUTH_TOKEN and self.TWILIO_PHONE_NUMBER)

    @property
    def has_livekit(self) -> bool:
        return bool(self.LIVEKIT_API_KEY and self.LIVEKIT_API_SECRET and self.LIVEKIT_URL)

    @property
    def has_supabase(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY)


@lru_cache
def get_settings() -> Settings:
    """Cached singleton accessor. Re-import this; config never reloads at runtime."""
    return Settings()
