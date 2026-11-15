"""Проверки доступности зависимостей для readiness-пробы."""

from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import text

from app.core.db import get_engine, get_redis


@dataclass(frozen=True, slots=True)
class CheckResult:
    """Результат проверки одной зависимости."""

    ok: bool
    latency_ms: float
    detail: str | None = None


async def check_database() -> CheckResult:
    started = time.perf_counter()
    try:
        async with get_engine().connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — проба обязана вернуть статус, а не упасть
        return CheckResult(ok=False, latency_ms=_elapsed_ms(started), detail=type(exc).__name__)
    return CheckResult(ok=True, latency_ms=_elapsed_ms(started))


async def check_cache() -> CheckResult:
    started = time.perf_counter()
    try:
        await get_redis().ping()
    except Exception as exc:  # noqa: BLE001
        return CheckResult(ok=False, latency_ms=_elapsed_ms(started), detail=type(exc).__name__)
    return CheckResult(ok=True, latency_ms=_elapsed_ms(started))


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)
