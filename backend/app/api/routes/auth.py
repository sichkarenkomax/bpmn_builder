"""Учётные записи и сессии (4.1).

Пароль проверяется scrypt-хешем, сессия живёт в БД, а браузер получает
HttpOnly-cookie с токеном. Для API-клиентов тот же токен принимается как
`Authorization: Bearer`. Отдельного JWT нет: отзыв сессии — это удаление строки.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.api.deps import SESSION_COOKIE, get_current_user, get_session, session_token
from app.core.config import get_settings
from app.core.events import USER_CREATED
from app.core.events import publish as publish_event
from app.core.security import hash_password, hash_token, new_session_token, verify_password
from app.db.models import AuthSession, User
from app.schemas.auth import LoginRequest, RegisterRequest, UserRead
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=settings.auth_session_days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
    )


async def _open_session(response: Response, session: AsyncSession, user: User) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    # Просроченные сессии пользователя не копятся.
    for stale in await session.scalars(
        select(AuthSession).where(
            AuthSession.user_id == user.id,
            AuthSession.expires_at < now,
        )
    ):
        await session.delete(stale)

    token = new_session_token()
    session.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=now + timedelta(days=settings.auth_session_days),
        )
    )
    await session.commit()
    _set_session_cookie(response, token)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    """Создаёт учётную запись и сразу открывает сессию."""
    exists = await session.scalar(select(User).where(User.email == payload.email))
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EmailTaken", "message": "пользователь с таким email уже есть"},
        )

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EmailTaken", "message": "пользователь с таким email уже есть"},
        ) from exc

    await _open_session(response, session, user)
    await session.refresh(user)
    await publish_event(USER_CREATED, {"user_id": user.id, "email": user.email})
    return user


@router.post("/login", response_model=UserRead)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.scalar(select(User).where(User.email == payload.email))
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "BadCredentials", "message": "Неверный email или пароль"},
        )
    await _open_session(response, session, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> Response:
    token = session_token(request)
    if token:
        record = await session.scalar(
            select(AuthSession).where(AuthSession.token_hash == hash_token(token))
        )
        if record is not None:
            await session.delete(record)
            await session.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/users", response_model=list[UserRead])
async def search_users(
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    query: str = Query(default="", max_length=255),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[User]:
    """Справочник для выдачи прав: поиск по имени или email."""
    statement = select(User).where(User.is_active.is_(True))
    text = query.strip()
    if text:
        pattern = f"%{text}%"
        statement = statement.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))
    rows = await session.scalars(statement.order_by(User.name).limit(limit))
    return list(rows)


__all__ = ["router"]
