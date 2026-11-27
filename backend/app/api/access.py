"""Проверка прав на диаграмму (4.1).

Роли складываются: owner > editor > commenter > viewer. Владелец определяется
по `diagram.owner_id`, остальные — строкой `diagram_acl`. Пользователь без роли
не видит диаграмму: список фильтруется, одиночные запросы получают 403.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal

from app.api.deps import get_current_user, get_session
from app.db.models import Diagram, DiagramAcl, User
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

Role = Literal["viewer", "commenter", "editor", "owner"]

ROLE_RANK: dict[str, int] = {
    "viewer": 1,
    "commenter": 2,
    "editor": 3,
    "owner": 4,
}


@dataclass(frozen=True)
class DiagramAccess:
    diagram: Diagram
    user: User
    role: str

    def allows(self, minimum: Role) -> bool:
        return ROLE_RANK.get(self.role, 0) >= ROLE_RANK[minimum]


async def resolve_role(session: AsyncSession, diagram: Diagram, user: User) -> str | None:
    if diagram.owner_id is not None and diagram.owner_id == user.id:
        return "owner"
    acl = await session.scalar(
        select(DiagramAcl).where(
            DiagramAcl.diagram_id == diagram.id,
            DiagramAcl.user_id == user.id,
        )
    )
    return acl.role if acl is not None and acl.role in ROLE_RANK else None


def forbidden(required: Role, actual: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "Forbidden",
            "message": "недостаточно прав на диаграмму",
            "required": required,
            "actual": actual,
        },
    )


async def load_diagram_access(
    session: AsyncSession,
    diagram_id: str,
    user: User,
    minimum: Role = "viewer",
) -> DiagramAccess:
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")
    role = await resolve_role(session, diagram, user)
    if role is None:
        raise forbidden(minimum)
    if ROLE_RANK[role] < ROLE_RANK[minimum]:
        raise forbidden(minimum, role)
    return DiagramAccess(diagram=diagram, user=user, role=role)


def require_diagram(minimum: Role = "viewer") -> Callable[..., Awaitable[DiagramAccess]]:
    """FastAPI-зависимость: 404/403 до входа в обработчик."""

    async def dependency(
        diagram_id: str,
        user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> DiagramAccess:
        return await load_diagram_access(session, diagram_id, user, minimum)

    return dependency


__all__ = [
    "ROLE_RANK",
    "DiagramAccess",
    "Role",
    "forbidden",
    "load_diagram_access",
    "require_diagram",
    "resolve_role",
]
