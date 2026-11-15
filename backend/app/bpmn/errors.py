"""Ошибки разбора и валидации BPMN с привязкой к месту в документе."""

from __future__ import annotations


class BpmnError(Exception):
    """Базовая ошибка: всегда знает, где в XML случилась проблема."""

    def __init__(self, message: str, *, line: int | None = None, column: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.line = line
        self.column = column

    def as_detail(self) -> dict[str, int | str | None]:
        return {"message": self.message, "line": self.line, "column": self.column}


class BpmnSyntaxError(BpmnError):
    """XML не разбирается или не является BPMN."""


class BpmnSchemaError(BpmnError):
    """XML не проходит валидацию по XSD BPMN 2.0."""


class BpmnModelError(BpmnError):
    """XML валиден, но не укладывается в поддерживаемое подмножество."""
