"""Конфиг правил и пользовательские JSON-правила — задачи 2.1.5 и 2.4.1."""

from __future__ import annotations

import json
from pathlib import Path

from app.bpmn.model import BpmnDocument, Flow, FlowType, Node, NodeType, Process
from app.schemas.validation import ValidationReport
from app.validation import build_engine, load_rule_config, parse_rule_config


def document(*, extra: Node | None = None) -> BpmnDocument:
    nodes = [
        Node(id="Start", type=NodeType.START_EVENT, name="Старт"),
        Node(id="Task", type=NodeType.USER_TASK, name="Согласовать"),
        Node(id="End", type=NodeType.END_EVENT, name="Конец"),
    ]
    if extra is not None:
        nodes.insert(2, extra)
    processes = [
        Process(
            id="Process_1",
            name="Процесс",
            nodes=nodes,
            flows=[
                Flow(id="F1", type=FlowType.SEQUENCE, source_ref="Start", target_ref="Task"),
                Flow(
                    id="F2",
                    type=FlowType.SEQUENCE,
                    source_ref="Task",
                    target_ref=extra.id if extra else "End",
                ),
            ],
        )
    ]
    return BpmnDocument(id="Definitions_1", processes=processes)


def codes(report: ValidationReport) -> set[str]:
    return {item.rule_id for item in report.findings}


def test_rules_can_be_disabled_and_severity_overridden() -> None:
    config = parse_rule_config(
        {
            "rules": {
                "BPMN-STRUCT-001": {"enabled": False},
                "BPMN-STRUCT-002": {"severity": "warning"},
                "BPMN-STRUCT-004": {"enabled": False},
            }
        }
    )
    doc = document()
    doc.processes[0].nodes = [
        node
        for node in doc.processes[0].nodes
        if node.type not in {NodeType.START_EVENT, NodeType.END_EVENT}
    ]

    report = build_engine(config).validate(doc)

    assert "BPMN-STRUCT-001" not in codes(report)
    assert report.summary.warnings >= 1
    assert not any(
        item.rule_id == "BPMN-STRUCT-002" and item.severity == "error" for item in report.findings
    )


def test_unknown_rule_code_is_config_warning() -> None:
    config = parse_rule_config({"rules": {"BPMN-UNKNOWN-999": {"enabled": False}}})

    assert config.errors
    assert "BPMN-UNKNOWN-999" in config.errors[0]
    assert build_engine(config).validate(document()).valid is True


def test_broken_config_is_reported_not_raised(tmp_path: Path) -> None:
    path = tmp_path / "rules.json"
    path.write_text("{ not json", encoding="utf-8")

    config = load_rule_config(path)

    assert config.errors
    assert "не JSON" in config.errors[0]


def test_missing_config_file_is_not_error(tmp_path: Path) -> None:
    config = load_rule_config(tmp_path / "absent.json")

    assert config.errors
    assert load_rule_config(None).errors == ()


def test_invalid_custom_rule_parameters(tmp_path: Path) -> None:
    path = tmp_path / "rules.json"
    path.write_text(
        json.dumps({"custom_rules": [{"id": "BPMN-CUSTOM-001", "kind": "max_elements"}]}),
        encoding="utf-8",
    )

    config = load_rule_config(path)

    assert config.errors
    assert "max" in config.errors[0]


def test_custom_rules_cannot_shadow_builtin_ids() -> None:
    config = parse_rule_config(
        {
            "custom_rules": [
                {"id": "BPMN-STRUCT-001", "kind": "max_elements", "max": 10},
                {"id": "BPMN-CUSTOM-001", "kind": "max_elements", "max": 10},
                {"id": "BPMN-CUSTOM-001", "kind": "max_elements", "max": 20},
            ]
        }
    )

    assert any("перекрывает встроенное" in item for item in config.errors)
    assert any("повторяющийся id" in item for item in config.errors)
    assert [rule.id for rule in config.custom_rules] == ["BPMN-CUSTOM-001"]


def test_max_elements_custom_rule() -> None:
    config = parse_rule_config(
        {
            "custom_rules": [
                {"id": "BPMN-CUSTOM-001", "kind": "max_elements", "max": 2, "severity": "error"}
            ]
        }
    )

    report = build_engine(config).validate(document())

    assert "BPMN-CUSTOM-001" in codes(report)
    finding = next(item for item in report.findings if item.rule_id == "BPMN-CUSTOM-001")
    assert finding.element_id == "Process_1"
    assert finding.severity == "error"


def test_max_outgoing_flows_custom_rule() -> None:
    config = parse_rule_config(
        {"custom_rules": [{"id": "BPMN-CUSTOM-001", "kind": "max_outgoing_flows", "max": 1}]}
    )
    doc = document(extra=Node(id="Task_B", type=NodeType.TASK, name="Вторая"))
    doc.processes[0].flows.append(
        Flow(id="F3", type=FlowType.SEQUENCE, source_ref="Start", target_ref="Task_B")
    )
    doc.processes[0].flows.append(
        Flow(id="F4", type=FlowType.SEQUENCE, source_ref="Task_B", target_ref="End")
    )

    report = build_engine(config).validate(doc)

    finding = next(item for item in report.findings if item.rule_id == "BPMN-CUSTOM-001")
    assert finding.element_id == "Start"


def test_required_attribute_custom_rule() -> None:
    config = parse_rule_config(
        {
            "custom_rules": [
                {
                    "id": "BPMN-CUSTOM-001",
                    "kind": "required_attribute",
                    "attribute": "documentation",
                    "node_types": ["userTask"],
                }
            ]
        }
    )

    report = build_engine(config).validate(document())

    finding = next(item for item in report.findings if item.rule_id == "BPMN-CUSTOM-001")
    assert finding.element_id == "Task"
    assert "документация" in finding.message


def test_forbidden_and_required_node_type_rules() -> None:
    config = parse_rule_config(
        {
            "custom_rules": [
                {
                    "id": "BPMN-CUSTOM-001",
                    "kind": "forbidden_node_type",
                    "node_type": "userTask",
                },
                {
                    "id": "BPMN-CUSTOM-002",
                    "kind": "required_node_type",
                    "node_type": "serviceTask",
                },
            ]
        }
    )

    report = build_engine(config).validate(document())

    assert "BPMN-CUSTOM-001" in codes(report)
    assert "BPMN-CUSTOM-002" in codes(report)


def test_categories_filter_applies_to_custom_and_builtin() -> None:
    config = parse_rule_config({})
    report = build_engine(config, categories=frozenset({"gateway"})).validate(document())

    assert all(item.rule_id.startswith("BPMN-GATEWAY-") for item in report.findings)
