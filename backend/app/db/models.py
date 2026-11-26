"""Таблицы по ADR-003: диаграмма, версии, права, комментарии, вложения."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class Diagram(Base):
    __tablename__ = "diagram"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    owner_id: Mapped[str | None] = mapped_column(String(64), default=None)
    #: id версии хранится без FK: версия и диаграмма ссылаются друг на друга,
    #: а циклические FK усложняют миграции без пользы.
    current_version_id: Mapped[str | None] = mapped_column(String(36), default=None)
    etag: Mapped[str | None] = mapped_column(String(64), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    versions: Mapped[list[DiagramVersion]] = relationship(
        back_populates="diagram", cascade="all, delete-orphan", order_by="DiagramVersion.created_at"
    )


class DiagramVersion(Base):
    __tablename__ = "diagram_version"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    diagram_id: Mapped[str] = mapped_column(
        ForeignKey("diagram.id", ondelete="CASCADE"), index=True
    )
    xml: Mapped[str] = mapped_column(Text)
    message: Mapped[str | None] = mapped_column(String(255), default=None)
    author_id: Mapped[str | None] = mapped_column(String(64), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    diagram: Mapped[Diagram] = relationship(back_populates="versions")


class DiagramAcl(Base):
    __tablename__ = "diagram_acl"
    __table_args__ = (UniqueConstraint("diagram_id", "user_id", name="uq_acl_diagram_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    diagram_id: Mapped[str] = mapped_column(
        ForeignKey("diagram.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(32), default="viewer")


class Comment(Base):
    __tablename__ = "comment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    diagram_id: Mapped[str] = mapped_column(
        ForeignKey("diagram.id", ondelete="CASCADE"), index=True
    )
    element_id: Mapped[str | None] = mapped_column(String(255), default=None)
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[str | None] = mapped_column(String(64), default=None)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SimulationRun(Base):
    """Сохранённый прогон токена: входные данные и полученный отчёт."""

    __tablename__ = "simulation_run"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    diagram_id: Mapped[str] = mapped_column(
        ForeignKey("diagram.id", ondelete="CASCADE"), index=True
    )
    #: Версия XML, по которой шёл прогон (без FK: версия может исчезнуть).
    version_id: Mapped[str | None] = mapped_column(String(36), default=None)
    variables: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    choices: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    report: Mapped[dict[str, object]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TestCase(Base):
    """Тест-кейс симуляции: входные переменные и ожидаемый результат."""

    __tablename__ = "test_case"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    diagram_id: Mapped[str] = mapped_column(
        ForeignKey("diagram.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    variables: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    choices: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    expected_steps: Mapped[list[str]] = mapped_column(JSON, default=list)
    expected_variables: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )


class Attachment(Base):
    __tablename__ = "attachment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    diagram_id: Mapped[str] = mapped_column(
        ForeignKey("diagram.id", ondelete="CASCADE"), index=True
    )
    element_id: Mapped[str | None] = mapped_column(String(255), default=None)
    s3_key: Mapped[str] = mapped_column(String(512))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(128), default=None)
    size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
