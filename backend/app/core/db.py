"""Асинхронные подключения к PostgreSQL (SQLAlchemy 2) и Redis."""

from __future__ import annotations

from typing import TYPE_CHECKING

from redis.asyncio import Redis, from_url
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.core.config import get_settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_redis: Redis | None = None


def get_engine() -> AsyncEngine:
    """Ленивая инициализация движка: приложение стартует и без доступной БД."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            pool_size=settings.database_pool_size,
            echo=settings.database_echo,
            pool_pre_ping=True,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=settings.redis_timeout_seconds,
        )
    return _redis


async def dispose_engine() -> None:
    """Закрывает пул соединений при остановке приложения."""
    global _engine, _session_factory, _redis
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
    if _redis is not None:
        await _redis.aclose()
        _redis = None
