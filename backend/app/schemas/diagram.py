"""Схемы запросов и ответов для диаграмм."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DiagramStatus = Literal["draft", "approved", "archived"]


class DiagramCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    status: DiagramStatus = "draft"
    #: Если XML не передан, создаётся пустая диаграмма.
    bpmn_xml: str | None = None


class DiagramUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    #: Пустая строка очищает описание; отсутствие поля — не трогает его.
    description: str | None = Field(default=None, max_length=5000)
    status: DiagramStatus | None = None


class DiagramRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None
    status: str
    etag: str | None
    current_version_id: str | None
    created_at: datetime
    updated_at: datetime


class DiagramList(BaseModel):
    items: list[DiagramRead]
    total: int


class VersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    diagram_id: str
    message: str | None
    author_id: str | None
    created_at: datetime


class BpmnSaved(BaseModel):
    etag: str
    version_id: str


class BpmnContent(BaseModel):
    """Для клиентов, которым удобнее JSON, чем text/xml."""

    xml: str
