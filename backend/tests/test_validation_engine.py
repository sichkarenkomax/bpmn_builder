"""Реестр правил и движок валидации — задача 2.1.2."""

from __future__ import annotations

import pytest
from app.bpmn.model import BpmnDocument, Flow, FlowType, Node, NodeType, Process
from app.schemas.validation import Finding, Severity
from app.validation import EngineOptions, Rule, RuleContext, RuleRegistry, ValidationEngine


def document() -> BpmnDocument:
    return BpmnDocument(
        id="Definitions_1",
        processes=[
            Process(
                id="Process_1",
                nodes=[
                    Node(id="Start", type=NodeType.START_EVENT, name="Начало"),
                    Node(id="Task_A", type=NodeType.TASK, name="Задача A"),
                    Node(id="Task_B", type=NodeType.TASK, name="Задача B"),
                    Node(id="End", type=NodeType.END_EVENT, name="Конец"),
                ],
                flows=[
                    Flow(
                        id="Flow_A",
                        type=FlowType.SEQUENCE,
                        source_ref="Start",
                        target_ref="Task_A",
                    ),
                    Flow(
                        id="Flow_B",
                        type=FlowType.SEQUENCE,
                        source_ref="Task_A",
                        target_ref="End",
                    ),
                ],
            )
        ],
    )


def finding(
    rule_id: str,
    element_id: str,
    severity: Severity = "error",
    message: str = "проблема",
) -> Finding:
    return Finding(
        rule_id=rule_id,
        severity=severity,
        message=message,
        element_id=element_id,
    )


def test_engine_builds_graph_once_and_runs_rule() -> None:
    registry = RuleRegistry()
    observed: dict[str, object] = {}

    @registry.rule("BPMN-STRUCT-001", category="structure")
    def rule(context: RuleContext) -> list[Finding]:
        observed["edge"] = context.graph.has_edge("Start", "Task_A")
        observed["node"] = context.node("Task_A") is not None
        observed["process"] = context.process("Process_1") is not None
        return [finding("BPMN-STRUCT-001", "Task_A")]

    report = ValidationEngine(registry).validate(document())

    assert observed == {"edge": True, "node": True, "process": True}
    assert report.valid is False
    assert report.summary.errors == 1
    assert report.duration_ms >= 0


def test_empty_registry_returns_valid_report() -> None:
    report = ValidationEngine(RuleRegistry()).validate(document())

    assert report.valid is True
    assert report.summary.errors == 0
    assert report.findings == []


def test_engine_filters_categories_and_disabled_rules() -> None:
    registry = RuleRegistry()

    @registry.rule("BPMN-STRUCT-001", category="structure")
    def structural(_context: RuleContext) -> list[Finding]:
        return [finding("BPMN-STRUCT-001", "Task_A")]

    @registry.rule("BPMN-GATEWAY-001", category="gateway", severity="warning")
    def gateway(_context: RuleContext) -> list[Finding]:
        return [finding("BPMN-GATEWAY-001", "Task_B", severity="warning")]

    only_gateway = ValidationEngine(registry).validate(
        document(), options=EngineOptions(categories=frozenset({"gateway"}))
    )
    disabled = ValidationEngine(registry).validate(
        document(), options=EngineOptions(disabled_rule_ids=frozenset({"BPMN-STRUCT-001"}))
    )

    assert [item.rule_id for item in only_gateway.findings] == ["BPMN-GATEWAY-001"]
    assert [item.rule_id for item in disabled.findings] == ["BPMN-GATEWAY-001"]


def test_engine_deduplicates_and_sorts_findings() -> None:
    registry = RuleRegistry()

    @registry.rule("BPMN-STRUCT-001", category="structure")
    def structural(_context: RuleContext) -> list[Finding]:
        return [
            finding("BPMN-STRUCT-001", "Task_B"),
            finding("BPMN-STRUCT-001", "Task_A"),
            finding("BPMN-STRUCT-001", "Task_A"),
        ]

    @registry.rule("BPMN-GATEWAY-001", category="gateway", severity="warning")
    def gateway(_context: RuleContext) -> list[Finding]:
        return [finding("BPMN-GATEWAY-001", "Task_A", severity="warning")]

    report = ValidationEngine(registry).validate(document())

    assert [(item.severity, item.element_id, item.rule_id) for item in report.findings] == [
        ("error", "Task_A", "BPMN-STRUCT-001"),
        ("error", "Task_B", "BPMN-STRUCT-001"),
        ("warning", "Task_A", "BPMN-GATEWAY-001"),
    ]
    assert report.summary.errors == 2
    assert report.summary.warnings == 1


def test_severity_override_can_invalidate_report() -> None:
    registry = RuleRegistry()

    @registry.rule("BPMN-GATEWAY-001", category="gateway", severity="warning")
    def gateway(_context: RuleContext) -> list[Finding]:
        return [finding("BPMN-GATEWAY-001", "Task_A", severity="warning")]

    report = ValidationEngine(registry).validate(
        document(),
        options=EngineOptions(
            severity_overrides={"BPMN-GATEWAY-001": "error"},
        ),
    )

    assert report.valid is False
    assert report.summary.errors == 1
    assert report.findings[0].severity == "error"


def test_rule_cannot_return_foreign_code() -> None:
    registry = RuleRegistry()

    @registry.rule("BPMN-STRUCT-001", category="structure")
    def structural(_context: RuleContext) -> list[Finding]:
        return [finding("BPMN-STRUCT-002", "Task_A")]

    with pytest.raises(ValueError, match="чужим кодом"):
        ValidationEngine(registry).validate(document())


def test_registry_rejects_duplicate_and_bad_codes() -> None:
    registry = RuleRegistry()

    @registry.rule("BPMN-STRUCT-001", category="structure")
    def structural(_context: RuleContext) -> list[Finding]:
        return []

    with pytest.raises(ValueError, match="уже зарегистрировано"):
        registry.register(
            Rule(
                rule_id="BPMN-STRUCT-001",
                category="structure",
                default_severity="error",
                check=structural,
            )
        )

    with pytest.raises(ValueError, match="некорректный код"):
        Rule(
            rule_id="struct-001",
            category="structure",
            default_severity="error",
            check=structural,
        )
