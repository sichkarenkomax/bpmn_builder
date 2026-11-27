"""Комментарии-аннотации на холсте (1.3.8, права — 4.1/4.2).

Поток обсуждения плоский, как в таблице `comment` из ADR-003: каждый
комментарий — сообщение в ветке элемента. Автор берётся из сессии, а не из
тела запроса. Resolve ставит `resolved_at`, повторный resolve идемпотентен.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.api.access import DiagramAccess, require_diagram
from app.api.deps import get_session
from app.core.events import COMMENT_CREATED
from app.core.events import publish as publish_event
from app.db.models import Comment
from app.schemas.comment import CommentCreate, CommentRead, CommentUpdate
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/diagrams/{diagram_id}/comments", tags=["comments"])


def _forbidden(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "Forbidden", "message": message},
    )


async def _load_comment(session: AsyncSession, diagram_id: str, comment_id: str) -> Comment:
    comment = await session.get(Comment, comment_id)
    if comment is None or comment.diagram_id != diagram_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="комментарий не найден")
    return comment


@router.get("", response_model=list[CommentRead])
async def list_comments(
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
    element_id: str | None = Query(default=None, max_length=255),
    include_resolved: bool = Query(default=True),
) -> list[Comment]:
    query = select(Comment).where(Comment.diagram_id == access.diagram.id)
    if element_id is not None:
        query = query.where(Comment.element_id == element_id)
    if not include_resolved:
        query = query.where(Comment.resolved_at.is_(None))
    rows = await session.scalars(query.order_by(Comment.created_at))
    return list(rows)


@router.post("", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    payload: CommentCreate,
    access: DiagramAccess = Depends(require_diagram("commenter")),
    session: AsyncSession = Depends(get_session),
) -> Comment:
    comment = Comment(
        diagram_id=access.diagram.id,
        element_id=payload.element_id,
        body=payload.body.strip(),
        author_id=access.user.id,
    )
    if not comment.body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="пустой комментарий")
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    await publish_event(
        COMMENT_CREATED,
        {
            "diagram_id": access.diagram.id,
            "comment_id": comment.id,
            "element_id": comment.element_id,
            "author_id": comment.author_id,
        },
    )
    return comment


@router.patch("/{comment_id}", response_model=CommentRead)
async def update_comment(
    comment_id: str,
    payload: CommentUpdate,
    access: DiagramAccess = Depends(require_diagram("commenter")),
    session: AsyncSession = Depends(get_session),
) -> Comment:
    comment = await _load_comment(session, access.diagram.id, comment_id)
    author = comment.author_id == access.user.id

    if "body" in payload.model_fields_set and payload.body is not None:
        if not author and access.role != "owner":
            raise _forbidden("править текст может только автор или владелец диаграммы")
        body = payload.body.strip()
        if not body:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="пустой комментарий"
            )
        comment.body = body
    if payload.resolved is not None:
        if not author and access.role not in {"owner", "editor"}:
            raise _forbidden("менять статус может автор, владелец или редактор")
        comment.resolved_at = datetime.now(UTC) if payload.resolved else None
    await session.commit()
    await session.refresh(comment)
    return comment


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: str,
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    comment = await _load_comment(session, access.diagram.id, comment_id)
    if comment.author_id != access.user.id and access.role != "owner":
        raise _forbidden("удалить комментарий может только автор или владелец диаграммы")
    await session.delete(comment)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
