"""Правила шлюзов и событий — задача 2.1.4."""

from __future__ import annotations

from app.bpmn.model import BpmnDocument, Flow, FlowType, Node, NodeType, Process
from app.validation import ValidationEngine


def node(
    element_id: str,
    node_type: NodeType = NodeType.TASK,
    *,
    name: str | None = None,
    default_flow: str | None = None,
    attached_to: str | None = None,
) -> Node:
    return Node(
        id=element_id,
        type=node_type,
        name=name,
        default_flow=default_flow,
        attached_to=attached_to,
    )


def flow(flow_id: str, source: str, target: str, *, condition: str | None = None) -> Flow:
    return Flow(
        id=flow_id,
        type=FlowType.SEQUENCE,
        source_ref=source,
        target_ref=target,
        condition=condition,
    )


def document(process: Process) -> BpmnDocument:
    return BpmnDocument(id="Definitions_1", processes=[process])


def codes(process: Process) -> set[str]:
    report = ValidationEngine().validate(document(process))
    return {item.rule_id for item in report.findings}


def test_exclusive_split_branch_without_condition() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Split", NodeType.EXCLUSIVE_GATEWAY, name="Развилка"),
            node("A"),
            node("B"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Split"),
            flow("F_A", "Split", "A", condition="x > 0"),
            flow("F_B", "Split", "B"),
            flow("F_EA", "A", "End"),
            flow("F_EB", "B", "End"),
        ],
    )

    report = ValidationEngine().validate(document(process))

    findings = [item for item in report.findings if item.rule_id == "BPMN-GATEWAY-001"]
    assert [item.element_id for item in findings] == ["F_B"]
    assert any(item.rule_id == "BPMN-GATEWAY-002" for item in report.findings)


def test_default_flow_is_not_required_to_have_condition() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Split", NodeType.EXCLUSIVE_GATEWAY, default_flow="F_B"),
            node("A"),
            node("B"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Split"),
            flow("F_A", "Split", "A", condition="x > 0"),
            flow("F_B", "Split", "B"),
            flow("F_EA", "A", "End"),
            flow("F_EB", "B", "End"),
        ],
    )

    report = ValidationEngine().validate(document(process))

    assert "BPMN-GATEWAY-001" not in codes(process)
    assert "BPMN-GATEWAY-002" not in {item.rule_id for item in report.findings}


def test_default_flow_with_condition() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Split", NodeType.INCLUSIVE_GATEWAY, default_flow="F_B"),
            node("A"),
            node("B"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Split"),
            flow("F_A", "Split", "A", condition="x > 0"),
            flow("F_B", "Split", "B", condition="x <= 0"),
            flow("F_EA", "A", "End"),
            flow("F_EB", "B", "End"),
        ],
    )

    assert "BPMN-GATEWAY-003" in codes(process)


def test_default_flow_not_outgoing() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Split", NodeType.EXCLUSIVE_GATEWAY, default_flow="F_A"),
            node("A"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Split"),
            flow("F_A", "Start", "A"),
            flow("F_EA", "A", "End"),
        ],
    )

    assert "BPMN-GATEWAY-004" in codes(process)


def test_default_flow_referencing_missing_flow() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Split", NodeType.EXCLUSIVE_GATEWAY, default_flow="Missing"),
            node("A"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Split"),
            flow("F_A", "Split", "A", condition="x"),
            flow("F_EA", "A", "End"),
        ],
    )

    assert "BPMN-GATEWAY-004" in codes(process)


def test_gateway_both_splits_and_merges() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Split", NodeType.PARALLEL_GATEWAY),
            node("Merge", NodeType.PARALLEL_GATEWAY),
            node("A"),
            node("B"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Split"),
            flow("F1", "Split", "A"),
            flow("F2", "Split", "B"),
            flow("F3", "A", "Merge"),
            flow("F4", "B", "Merge"),
            flow("F5", "Merge", "End"),
            flow("F6", "A", "Split"),
        ],
    )

    # Split получает входящий поток от A: одновременно сливает и разделяет.
    assert "BPMN-GATEWAY-005" in codes(process)


def test_event_gateway_must_target_catch_events() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Events", NodeType.EVENT_BASED_GATEWAY),
            node("Catch", NodeType.INTERMEDIATE_CATCH_EVENT),
            node("Task"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Events"),
            flow("F_CATCH", "Events", "Catch"),
            flow("F_TASK", "Events", "Task"),
            flow("F_E1", "Catch", "End"),
            flow("F_E2", "Task", "End"),
        ],
    )

    report = ValidationEngine().validate(document(process))

    findings = [item for item in report.findings if item.rule_id == "BPMN-GATEWAY-006"]
    assert len(findings) == 1
    assert "Task" in findings[0].message


def test_start_without_outgoing_and_end_with_outgoing() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("End", NodeType.END_EVENT),
            node("After", NodeType.TASK),
        ],
        flows=[flow("F", "End", "After")],
    )

    found = codes(process)

    assert "BPMN-EVENT-002" in found
    assert "BPMN-EVENT-003" in found


def test_boundary_event_missing_attachment_target() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Task"),
            node("Boundary", NodeType.BOUNDARY_EVENT, attached_to="Missing"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F1", "Start", "Task"),
            flow("F2", "Task", "End"),
            flow("F3", "Boundary", "End"),
        ],
    )

    assert "BPMN-EVENT-001" in codes(process)


def test_boundary_event_on_non_activity_is_warning() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Boundary", NodeType.BOUNDARY_EVENT, attached_to="Start"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[flow("F1", "Start", "End"), flow("F2", "Boundary", "End")],
    )

    report = ValidationEngine().validate(document(process))

    findings = [item for item in report.findings if item.rule_id == "BPMN-EVENT-004"]
    assert len(findings) == 1
    assert findings[0].severity == "warning"


def test_clean_gateway_process_has_no_gateway_findings() -> None:
    process = Process(
        id="Process_1",
        nodes=[
            node("Start", NodeType.START_EVENT),
            node("Split", NodeType.EXCLUSIVE_GATEWAY, default_flow="F_B"),
            node("A"),
            node("B"),
            node("End", NodeType.END_EVENT),
        ],
        flows=[
            flow("F0", "Start", "Split"),
            flow("F_A", "Split", "A", condition="x > 0"),
            flow("F_B", "Split", "B"),
            flow("F_EA", "A", "End"),
            flow("F_EB", "B", "End"),
        ],
    )

    report = ValidationEngine().validate(document(process))

    assert report.valid is True
    assert report.findings == []
