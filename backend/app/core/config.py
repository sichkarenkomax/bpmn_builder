"""Настройки приложения: читаются из окружения и .env, валидируются pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Единая точка конфигурации. Значения по умолчанию — для локального docker compose."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "bpmn-studio"
    app_version: str = "0.0.1"
    environment: Literal["local", "test", "staging", "production"] = "local"
    debug: bool = False
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://bpmn:bpmn@localhost:5432/bpmn"
    database_pool_size: int = 5
    database_echo: bool = False

    redis_url: str = "redis://localhost:6379/0"
    redis_timeout_seconds: float = 1.0

    s3_endpoint_url: str = "http://localhost:9000"
    s3_bucket: str = "bpmn-studio"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost", "http://localhost:5173"]
    )

    @field_validator("database_url")
    @classmethod
    def _require_async_driver(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            msg = "нужен асинхронный драйвер: postgresql+asyncpg://..."
            raise ValueError(msg)
        return value


@lru_cache
def get_settings() -> Settings:
    """Настройки кешируются: читаем окружение один раз на процесс."""
    return Settings()
