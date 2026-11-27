"""Схемы ядра: какие модули включены в этом процессе."""

from pydantic import BaseModel


class ModuleInfo(BaseModel):
    """Паспорт включённого модуля для frontend и диагностики."""

    name: str
    title: str
