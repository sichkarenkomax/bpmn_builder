"""Контракты ядра для прикладных модулей (ADR-006).

Модуль видит только этот файл: базовый класс моделей, зависимость сессии и
описание самого модуля. Внутренности ядра (`app.bpmn`, `app.simulation`,
`app.api.routes`) остаются закрытыми, чтобы включение и выключение модуля
не задевало редактор и его данные.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter

from app.api.deps import get_current_user, get_session
from app.db.base import Base

__all__ = ["Base", "ModuleSpec", "get_current_user", "get_session"]


@dataclass(frozen=True)
class ModuleSpec:
    """Паспорт модуля: имя, префикс таблиц и router для сборки приложения."""

    name: str
    title: str
    table_prefix: str
    router: APIRouter
