"""Контракт результата валидации BPMN (этап 2, задача 2.1.1).

`rule_id` стабилен: на него ссылаются CI, конфиг правил и панель проблем.
Коды XSD-ошибок идут отдельной серией `BPMN-XSD-*`, чтобы не смешивать их
со структурными правилами.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Severity = Literal["error", "warning", "info"]

VALIDATION_SCHEMA_VERSION = "1.0"

RULE_ID_PATTERN = r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$"


class Finding(BaseModel):
    """Одна проблема со ссылкой на элемент или место в XML."""

    model_config = ConfigDict(extra="forbid")

    rule_id: str = Field(pattern=RULE_ID_PATTERN, max_length=64)
    severity: Severity
    message: str = Field(min_length=1, max_length=2000)
    element_id: str | None = Field(default=None, max_length=255)
    element_name: str | None = Field(default=None, max_length=500)
    line: int | None = Field(default=None, ge=1)
    column: int | None = Field(default=None, ge=1)
    hint: str | None = Field(default=None, max_length=2000)


class ValidationSummary(BaseModel):
    """Счётчики по severity. `errors` определяет `valid`."""

    model_config = ConfigDict(extra="forbid")

    errors: int = Field(default=0, ge=0)
    warnings: int = Field(default=0, ge=0)
    infos: int = Field(default=0, ge=0)


class ValidationReport(BaseModel):
    """Стабильный JSON-контракт для UI и CI."""

    model_config = ConfigDict(extra="forbid")

    valid: bool
    summary: ValidationSummary
    findings: list[Finding]
    duration_ms: float = Field(ge=0)
    schema_version: str = Field(default=VALIDATION_SCHEMA_VERSION, min_length=1, max_length=20)

    @model_validator(mode="after")
    def _summary_matches_findings(self) -> Self:
        expected = ValidationSummary(
            errors=sum(item.severity == "error" for item in self.findings),
            warnings=sum(item.severity == "warning" for item in self.findings),
            infos=sum(item.severity == "info" for item in self.findings),
        )
        if self.summary != expected:
            raise ValueError("summary не соответствует findings")
        if self.valid != (expected.errors == 0):
            raise ValueError("valid должен быть true только без ошибок")
        return self

    @classmethod
    def from_findings(cls, findings: Iterable[Finding], *, duration_ms: float) -> Self:
        """Собирает согласованный отчёт: счётчики и `valid` считаются здесь."""
        items = list(findings)
        summary = ValidationSummary(
            errors=sum(item.severity == "error" for item in items),
            warnings=sum(item.severity == "warning" for item in items),
            infos=sum(item.severity == "info" for item in items),
        )
        return cls(
            valid=summary.errors == 0,
            summary=summary,
            findings=items,
            duration_ms=duration_ms,
        )


__all__ = [
    "Finding",
    "Severity",
    "ValidationReport",
    "ValidationSummary",
    "VALIDATION_SCHEMA_VERSION",
]
