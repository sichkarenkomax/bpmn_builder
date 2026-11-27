"""Выдача прав на диаграмму (4.1).

Управляет только владелец. Роль owner не назначается через API: владелец один
и задаётся при создании диаграммы.
"""

from __future__ import annotations

from app.api.access import DiagramAccess, require_diagram
from app.api.deps import get_session
from app.db.models import DiagramAcl, User
from app.schemas.auth import AclEntryRead, AclUpdate
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/diagrams/{diagram_id}/acl", tags=["acl"])


def _entry(user: User, role: str, *, is_owner: bool = False) -> AclEntryRead:
    return AclEntryRead(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=role,
        is_owner=is_owner,
    )


@router.get("", response_model=list[AclEntryRead])
async def list_acl(
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> list[AclEntryRead]:
    rows = await session.execute(
        select(DiagramAcl, User)
        .join(User, User.id == DiagramAcl.user_id)
        .where(DiagramAcl.diagram_id == access.diagram.id)
    )
    entries = [_entry(user, row.role, is_owner=row.role == "owner") for row, user in rows]
    if not any(item.user_id == access.diagram.owner_id for item in entries):
        owner = (
            await session.get(User, access.diagram.owner_id) if access.diagram.owner_id else None
        )
        if owner is not None:
            entries.insert(0, _entry(owner, "owner", is_owner=True))
    entries.sort(key=lambda item: (item.role != "owner", item.name.lower()))
    return entries


@router.put("/{user_id}", response_model=AclEntryRead)
async def grant_role(
    user_id: str,
    payload: AclUpdate,
    access: DiagramAccess = Depends(require_diagram("owner")),
    session: AsyncSession = Depends(get_session),
) -> AclEntryRead:
    if user_id == access.diagram.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "OwnerRoleImmutable", "message": "роль владельца не меняется"},
        )
    target = await session.get(User, user_id)
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="пользователь не найден")

    acl = await session.scalar(
        select(DiagramAcl).where(
            DiagramAcl.diagram_id == access.diagram.id,
            DiagramAcl.user_id == user_id,
        )
    )
    if acl is None:
        acl = DiagramAcl(diagram_id=access.diagram.id, user_id=user_id, role=payload.role)
        session.add(acl)
    else:
        acl.role = payload.role
    await session.commit()
    return _entry(target, acl.role)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_role(
    user_id: str,
    access: DiagramAccess = Depends(require_diagram("owner")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    if user_id == access.diagram.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "OwnerRoleImmutable", "message": "владельца нельзя удалить из прав"},
        )
    acl = await session.scalar(
        select(DiagramAcl).where(
            DiagramAcl.diagram_id == access.diagram.id,
            DiagramAcl.user_id == user_id,
        )
    )
    if acl is not None:
        await session.delete(acl)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
