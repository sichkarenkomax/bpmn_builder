"""Контракт Finding/ValidationReport — задача 2.1.1."""

from __future__ import annotations

import pytest
from app.schemas.validation import (
    VALIDATION_SCHEMA_VERSION,
    Finding,
    ValidationReport,
    ValidationSummary,
)
from pydantic import ValidationError


def finding(
    rule_id: str = "BPMN-STRUCT-001",
    severity: str = "error",
    **overrides: object,
) -> Finding:
    data: dict[str, object] = {
        "rule_id": rule_id,
        "severity": severity,
        "message": "элемент недостижим",
        "element_id": "Task_1",
        "element_name": "Проверить заявку",
        "line": 12,
        "column": 5,
        "hint": "добавьте входящий поток",
    }
    data.update(overrides)
    return Finding.model_validate(data)


def test_finding_serializes_stable_contract() -> None:
    payload = finding().model_dump()

    assert set(payload) == {
        "rule_id",
        "severity",
        "message",
        "element_id",
        "element_name",
        "line",
        "column",
        "hint",
    }
    assert payload["rule_id"] == "BPMN-STRUCT-001"
    assert payload["severity"] == "error"


@pytest.mark.parametrize(
    "rule_id",
    ["BPMN-STRUCT-001", "BPMN-XSD-001", "BPMN-GATEWAY-003", "CUSTOM-LANE-012"],
)
def test_rule_id_accepts_stable_codes(rule_id: str) -> None:
    assert finding(rule_id=rule_id).rule_id == rule_id


@pytest.mark.parametrize("rule_id", ["struct-001", "BPMN-STRUCT", "BPMN-STRUCT-01", "1-BPMN-001"])
def test_rule_id_rejects_unstable_codes(rule_id: str) -> None:
    with pytest.raises(ValidationError):
        finding(rule_id=rule_id)


def test_finding_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        finding(document_id="diagram-1")


def test_report_from_findings_counts_and_derives_valid() -> None:
    report = ValidationReport.from_findings(
        [
            finding(severity="warning", rule_id="BPMN-GATEWAY-001"),
            finding(severity="info", rule_id="BPMN-EVENT-001"),
        ],
        duration_ms=12.5,
    )

    assert report.valid is True
    assert report.summary == ValidationSummary(errors=0, warnings=1, infos=1)
    assert report.duration_ms == 12.5
    assert report.schema_version == VALIDATION_SCHEMA_VERSION


def test_report_with_error_is_invalid() -> None:
    report = ValidationReport.from_findings([finding()], duration_ms=3.0)

    assert report.valid is False
    assert report.summary.errors == 1


def test_report_rejects_summary_mismatch() -> None:
    with pytest.raises(ValidationError, match="summary"):
        ValidationReport(
            valid=True,
            summary=ValidationSummary(errors=1),
            findings=[],
            duration_ms=1.0,
        )


def test_report_rejects_valid_with_error() -> None:
    with pytest.raises(ValidationError, match="valid"):
        ValidationReport(
            valid=True,
            summary=ValidationSummary(errors=1),
            findings=[finding()],
            duration_ms=1.0,
        )


def test_report_schema_has_contract_fields() -> None:
    schema = ValidationReport.model_json_schema()

    assert set(schema["required"]) == {"valid", "summary", "findings", "duration_ms"}
    assert VALIDATION_SCHEMA_VERSION in schema["properties"]["schema_version"]["default"]
