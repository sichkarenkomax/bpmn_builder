"""Схемы ответов API."""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness: приложение живо и отвечает."""

    status: Literal["ok"] = "ok"
    service: str
    version: str
    environment: str


class DependencyStatus(BaseModel):
    """Состояние одной зависимости."""

    status: Literal["up", "down"]
    latency_ms: float
    detail: str | None = None


class ReadinessResponse(BaseModel):
    """Readiness: приложение готово обслуживать запросы."""

    status: Literal["ok", "degraded"]
    dependencies: dict[str, DependencyStatus] = Field(default_factory=dict)
