"""Таймеры симуляции: ISO 8601 duration → миллисекунды ожидания.

Поддерживаются дни, часы, минуты и секунды (`P1DT2H30M`, `PT45S`); недели и
дробные значения с запятой тоже понимаем. Всё остальное (`timeDate`,
`timeCycle`, нестандартные выражения) не имеет длительности: панель показывает
выражение, но автопроигрывание не ждёт.
"""

from __future__ import annotations

import re

from app.bpmn.model import TimerDefinition, TimerKind

_DURATION_RE = re.compile(
    r"^P(?:(\d+)W)?(?:(\d+)D)?"
    r"(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$"
)


def parse_duration_ms(expression: str) -> int | None:
    """Переводит ISO 8601 duration в миллисекунды; `None`, если это не duration."""
    match = _DURATION_RE.match(expression.strip())
    if match is None:
        return None
    weeks, days, hours, minutes, seconds = match.groups()
    if not any((weeks, days, hours, minutes, seconds)):
        return None
    total_seconds = (
        int(weeks or 0) * 7 * 24 * 3600
        + int(days or 0) * 24 * 3600
        + (float(hours.replace(",", ".")) if hours else 0.0) * 3600
        + (float(minutes.replace(",", ".")) if minutes else 0.0) * 60
        + (float(seconds.replace(",", ".")) if seconds else 0.0)
    )
    return round(total_seconds * 1000)


def timer_wait_ms(timer: TimerDefinition | None) -> int | None:
    """Сколько ждать на событии; `None` — ждать нечего (дата или цикл)."""
    if timer is None or timer.kind is not TimerKind.DURATION:
        return None
    return parse_duration_ms(timer.expression)


__all__ = ["parse_duration_ms", "timer_wait_ms"]
