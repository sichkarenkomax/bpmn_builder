"""Прикладные модули поверх ядра (ADR-006).

Модуль лежит в `app/modules/<name>/` и состоит из `models.py`, `schemas.py`,
`service.py`, `routes.py`; таблицы — с префиксом `<name>_`. Ядро не импортирует
модули, сборка приложения берёт их из реестра (`registry.py`) по флагу
`MODULES_ENABLED`.
"""

from __future__ import annotations

from app.modules.registry import (
    MODULE_REGISTRY,
    ModuleConfigurationError,
    load_modules,
    parse_enabled,
)

__all__ = [
    "MODULE_REGISTRY",
    "ModuleConfigurationError",
    "load_modules",
    "parse_enabled",
]
