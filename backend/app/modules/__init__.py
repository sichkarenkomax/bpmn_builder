"""Прикладные модули поверх ядра (ADR-006).

Модуль лежит в `app/modules/<name>/` и состоит из `models.py`, `schemas.py`,
`service.py`, `routes.py`; таблицы — с префиксом `<name>_`. Ядро не импортирует
модули, сборка приложения берёт их только отсюда.
"""

from __future__ import annotations

from app.core.contracts import ModuleSpec
from app.modules.pilot import module as pilot

MODULES: tuple[ModuleSpec, ...] = (pilot,)

__all__ = ["MODULES"]
