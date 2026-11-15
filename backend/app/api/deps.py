"""Зависимости FastAPI."""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.core.db import get_session_factory
from sqlalchemy.ext.asyncio import AsyncSession


async def get_session() -> AsyncIterator[AsyncSession]:
    """Сессия на один запрос; коммит делает роут, откат — контекстный менеджер."""
    async with get_session_factory()() as session:
        yield session
