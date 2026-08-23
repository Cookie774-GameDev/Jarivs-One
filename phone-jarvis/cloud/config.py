"""
phone-jarvis cloud — config loader.

Reads from environment variables (loaded from .env in dev, Fly secrets in prod).
Pydantic settings give us validation + helpful error messages on missing keys.
"""

from functools import lru_cache
import re

from pydantic import Field, model_validator
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

    # --- Telnyx (approved production PSTN/SMS transport) ---
    TELNYX_API_KEY: str = Field(default="")
    TELNYX_PUBLIC_KEY: str = Field(default="")
    TELNYX_CALL_CONTROL_CONNECTION_ID: str = Field(default="")
    TELNYX_PHONE_NUMBER: str = Field(default="")

    # --- LiveKit (Path C) ---
    LIVEKIT_API_KEY: str = Field(default="")
    LIVEKIT_API_SECRET: str = Field(default="")
    LIVEKIT_URL: str = Field(default="")

    # --- Operator-default provider keys (fallback when user has no BYOK) ---
    DEEPGRAM_API_KEY: str = Field(default="")
    DEEPGRAM_FLUX_MODEL: str = Field(default="flux-general-en")
    DEEPGRAM_AURA_MODEL: str = Field(default="")
    DEEPSEEK_API_KEY: str = Field(default="")
    DEEPSEEK_MODEL: str = Field(default="deepseek-chat")
    ANTHROPIC_API_KEY: str = Field(default="")
    CARTESIA_API_KEY: str = Field(default="")
    GROQ_API_KEY: str = Field(default="")

    # --- Bridge auth ---
    BRIDGE_TOKEN_PEPPER: str = Field(default="dev_pepper_replace_in_production")
    MCP_PUBLIC_URL: str = Field(default="")

    # --- Public service boundary (fail closed until explicitly enabled) ---
    PHONE_JARVIS_ENABLED: bool = Field(default=False)
    PHONE_JARVIS_PUBLIC_BASE_URL: str = Field(default="")

    # --- Behavior ---
    AUDIT_RETENTION_DAYS: int = Field(default=30)
    COST_CAP_PER_CALL: float = Field(default=5.00)
    IDLE_HANGUP_SECONDS: int = Field(default=120)
    BRIDGE_TOKEN_TTL_SECONDS: int = Field(default=300)
    PIN_MAX_ATTEMPTS: int = Field(default=3)
    PIN_COOLDOWN_SECONDS: int = Field(default=3600)
    TELNYX_VOICE_USD_PER_MINUTE: float = Field(default=0.0)
    DEEPGRAM_FLUX_USD_PER_MINUTE: float = Field(default=0.0)
    DEEPGRAM_AURA_USD_PER_MILLION_CHARS: float = Field(default=0.0)
    DEEPSEEK_INPUT_USD_PER_MILLION_TOKENS: float = Field(default=0.0)
    DEEPSEEK_OUTPUT_USD_PER_MILLION_TOKENS: float = Field(default=0.0)
    CALL_ANYONE_MAX_CREDITS_PER_MINUTE: float = Field(default=0.0)

    # --- Server ---
    PORT: int = Field(default=8080)
    LOG_LEVEL: str = Field(default="INFO")

    @model_validator(mode="after")
    def validate_phone_service_boundary(self) -> "Settings":
        self.PHONE_JARVIS_PUBLIC_BASE_URL = self.PHONE_JARVIS_PUBLIC_BASE_URL.rstrip(
            "/"
        )
        if not self.PHONE_JARVIS_ENABLED:
            return self
        if not self.PHONE_JARVIS_PUBLIC_BASE_URL.startswith("https://"):
            raise ValueError(
                "PHONE_JARVIS_PUBLIC_BASE_URL must be a public HTTPS URL when PHONE_JARVIS_ENABLED is true"
            )
        if re.fullmatch(r"[0-9a-fA-F]{64}", self.BRIDGE_TOKEN_PEPPER) is None:
            raise ValueError(
                "BRIDGE_TOKEN_PEPPER must be a generated 64-character hexadecimal secret when PHONE_JARVIS_ENABLED is true"
            )
        return self

    @property
    def token_secret(self) -> str:
        return self.BRIDGE_TOKEN_PEPPER

    @property
    def has_twilio(self) -> bool:
        return bool(
            self.TWILIO_ACCOUNT_SID
            and self.TWILIO_AUTH_TOKEN
            and self.TWILIO_PHONE_NUMBER
        )

    @property
    def has_telnyx(self) -> bool:
        return bool(
            self.TELNYX_API_KEY
            and self.TELNYX_PUBLIC_KEY
            and self.TELNYX_CALL_CONTROL_CONNECTION_ID
            and self.TELNYX_PHONE_NUMBER
        )

    @property
    def has_call_anyone_pipeline(self) -> bool:
        return bool(
            self.has_telnyx
            and self.DEEPGRAM_API_KEY
            and self.DEEPGRAM_AURA_MODEL
            and self.DEEPSEEK_API_KEY
            and self.SUPABASE_URL
            and self.SUPABASE_SERVICE_ROLE_KEY
            and self.CALL_ANYONE_MAX_CREDITS_PER_MINUTE > 0
        )

    @property
    def has_livekit(self) -> bool:
        return bool(
            self.LIVEKIT_API_KEY and self.LIVEKIT_API_SECRET and self.LIVEKIT_URL
        )

    @property
    def has_supabase(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY)

    @property
    def has_browser_chat_mcp(self) -> bool:
        return bool(
            self.SUPABASE_URL.startswith("https://")
            and self.MCP_PUBLIC_URL.startswith("https://")
            and self.MCP_PUBLIC_URL.rstrip("/").endswith("/mcp")
        )


@lru_cache
def get_settings() -> Settings:
    """Cached singleton accessor. Re-import this; config never reloads at runtime."""
    return Settings()
