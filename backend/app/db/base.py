"""Базовый класс декларативных моделей."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Общая база: метаданные для create_all и Alembic."""
