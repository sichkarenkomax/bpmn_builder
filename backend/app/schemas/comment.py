"""Схемы комментариев к элементу схемы (1.3.8).

До этапа 4 учётных записей нет: автор — техническая метка (`local`),
интерфейс показывает её как «Вы».
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    element_id: str | None = Field(default=None, max_length=255)
    body: str = Field(min_length=1, max_length=4000)
    author_id: str | None = Field(default=None, max_length=64)


class CommentUpdate(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=4000)
    resolved: bool | None = None


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    diagram_id: str
    element_id: str | None
    body: str
    author_id: str | None
    resolved_at: datetime | None
    created_at: datetime


__all__ = ["CommentCreate", "CommentRead", "CommentUpdate"]
