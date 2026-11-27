"""Таблицы пилотного модуля: только собственный префикс `pilot_`."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.contracts import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class PilotNote(Base):
    __tablename__ = "pilot_note"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


__all__ = ["PilotNote"]
