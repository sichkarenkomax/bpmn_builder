"""Пилотный модуль 4.0.2: проверяет контракт ядра на живом CRUD."""

from __future__ import annotations

from app.core.contracts import ModuleSpec
from app.modules.pilot.routes import router

module = ModuleSpec(
    name="pilot",
    title="Пилотный модуль",
    table_prefix="pilot_",
    router=router,
)

__all__ = ["module"]
