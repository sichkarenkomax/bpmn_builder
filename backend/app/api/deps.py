"""Зависимости FastAPI: сессия БД и текущий пользователь (4.1)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime

from app.core.db import get_session_factory
from app.core.security import hash_token
from app.db.models import AuthSession, User
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

SESSION_COOKIE = "bpmn_session"


async def get_session() -> AsyncIterator[AsyncSession]:
    """Сессия на один запрос; коммит делает роут, откат — контекстный менеджер."""
    async with get_session_factory()() as session:
        yield session


def session_token(request: Request) -> str | None:
    """Токен из cookie (браузер) или `Authorization: Bearer` (API-клиенты)."""
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()
    return request.cookies.get(SESSION_COOKIE)


def unauthorized(detail: str = "требуется вход") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    """Аутентификация по сессии; анонимные запросы к API получают 401."""
    token = session_token(request)
    if not token:
        raise unauthorized()

    record = await session.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_token(token))
    )
    if record is None:
        raise unauthorized("сессия не найдена")
    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires <= datetime.now(UTC):
        await session.delete(record)
        await session.commit()
        raise unauthorized("сессия истекла")

    user = await session.get(User, record.user_id)
    if user is None or not user.is_active:
        raise unauthorized("учётная запись недоступна")
    return user


__all__ = [
    "SESSION_COOKIE",
    "get_current_user",
    "get_session",
    "session_token",
    "unauthorized",
]
