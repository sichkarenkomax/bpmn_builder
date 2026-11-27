"""DTO пилотного модуля: наружу отдаём только свои поля."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(default="", max_length=10_000)


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    body: str
    created_at: datetime


__all__ = ["NoteCreate", "NoteRead"]
