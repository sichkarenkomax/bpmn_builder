"""Тесты конфигурации."""

import pytest
from app.core.config import Settings
from pydantic import ValidationError


def test_defaults_are_local_friendly() -> None:
    settings = Settings()

    assert settings.api_prefix == "/api/v1"
    assert "asyncpg" in settings.database_url
    assert settings.redis_url.startswith("redis://")


def test_sync_postgres_driver_is_rejected() -> None:
    with pytest.raises(ValidationError, match="асинхронный драйвер"):
        Settings(database_url="postgresql://user:pass@localhost:5432/bpmn")


def test_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("APP_VERSION", "9.9.9")

    settings = Settings()

    assert settings.environment == "test"
    assert settings.app_version == "9.9.9"
