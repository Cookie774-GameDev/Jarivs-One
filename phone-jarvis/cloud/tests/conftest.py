import os

import pytest


@pytest.fixture(autouse=True)
def secure_test_environment(monkeypatch):
    monkeypatch.setenv("PHONE_JARVIS_ENABLED", "false")
    monkeypatch.setenv("PHONE_JARVIS_TOKEN_SECRET", "x" * 32)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
    from cloud.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
