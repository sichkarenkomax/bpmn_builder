"""Реестр прикладных модулей и feature flags (4.0.4).

`MODULES_ENABLED` — список имён через запятую. Модуль загружается лениво: если
флаг выключен, его `routes.py` и `service.py` не импортируются и приложение
стартует без него. Таблицы модуля при этом остаются в БД: миграции не зависят
от окружения, а включение флага не требует миграции данных.
"""

from __future__ import annotations

from collections.abc import Callable

from app.core.contracts import ModuleSpec

__all__ = [
    "MODULE_REGISTRY",
    "ModuleConfigurationError",
    "load_modules",
    "parse_enabled",
]

ModuleFactory = Callable[[], ModuleSpec]


def _pilot() -> ModuleSpec:
    from app.modules.pilot import module

    return module


#: Доступные модули. Новый модуль добавляется здесь одной записью.
MODULE_REGISTRY: dict[str, ModuleFactory] = {
    "pilot": _pilot,
}


class ModuleConfigurationError(ValueError):
    """Флаг `MODULES_ENABLED` ссылается на неизвестный или пустой модуль."""


def parse_enabled(raw: str) -> tuple[str, ...]:
    """Разбирает `MODULES_ENABLED`: `wiki,tasks,chat` → (`wiki`, `tasks`, `chat`).

    Пустая строка — валидное «ядро без модулей». Повторы схлопываются,
    порядок сохраняется; неизвестное имя — ошибка конфигурации, а не тихо
    проигнорированный модуль.
    """
    names: list[str] = []
    for item in raw.split(","):
        name = item.strip()
        if not name:
            continue
        if name not in MODULE_REGISTRY:
            available = ", ".join(sorted(MODULE_REGISTRY)) or "нет"
            msg = f"неизвестный модуль {name!r} в MODULES_ENABLED; доступны: {available}"
            raise ModuleConfigurationError(msg)
        if name not in names:
            names.append(name)
    return tuple(names)


def load_modules(raw: str) -> tuple[ModuleSpec, ...]:
    """Загружает только включённые модули, в порядке флага."""
    return tuple(MODULE_REGISTRY[name]() for name in parse_enabled(raw))
