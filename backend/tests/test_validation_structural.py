"""Структурные правила BPMN — задача 2.1.3."""

from __future__ import annotations

from app.bpmn.model import (
    BpmnDocument,
    Collaboration,
    Flow,
    FlowType,
    Lane,
    Node,
    NodeType,
    Participant,
    Process,
)
from app.schemas.validation import Finding
from app.validation import ValidationEngine


def node(element_id: str, node_type: NodeType = NodeType.TASK, name: str | None = None) -> Node:
    return Node(id=element_id, type=node_type, name=name)


def flow(flow_id: str, source: str, target: str) -> Flow:
    return Flow(id=flow_id, type=FlowType.SEQUENCE, source_ref=source, target_ref=target)


def process(
    nodes: list[Node],
    flows: list[Flow] | None = None,
    lanes: list[Lane] | None = None,
) -> Process:
    return Process(id="Process_1", nodes=nodes, flows=flows or [], lanes=lanes or [])


def document(
    processes: list[Process] | None = None,
    collaboration: Collaboration | None = None,
) -> BpmnDocument:
    return BpmnDocument(
        id="Definitions_1",
        processes=processes or [valid_process()],
        collaboration=collaboration,
    )


def valid_process() -> Process:
    return process(
        [node("Start", NodeType.START_EVENT), node("Task"), node("End", NodeType.END_EVENT)],
        [flow("Flow_1", "Start", "Task"), flow("Flow_2", "Task", "End")],
    )


def codes(report_findings: list[Finding]) -> set[str]:
    return {item.rule_id for item in report_findings}


def test_valid_document_has_no_findings() -> None:
    report = ValidationEngine().validate(document())

    assert report.valid is True
    assert report.findings == []


def test_empty_process_is_a_pool_stub() -> None:
    report = ValidationEngine().validate(document([process([])]))

    assert "BPMN-STRUCT-001" not in codes(report.findings)
    assert "BPMN-STRUCT-002" not in codes(report.findings)


def test_missing_start() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [node("Task"), node("End", NodeType.END_EVENT)],
                    [flow("F", "Task", "End")],
                )
            ]
        )
    )

    assert "BPMN-STRUCT-001" in codes(report.findings)


def test_missing_end() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [node("Start", NodeType.START_EVENT), node("Task")],
                    [flow("F", "Start", "Task")],
                )
            ]
        )
    )

    assert "BPMN-STRUCT-002" in codes(report.findings)


def test_unreachable_node() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [
                        node("Start", NodeType.START_EVENT),
                        node("Lost"),
                        node("End", NodeType.END_EVENT),
                    ],
                    [flow("F", "Start", "End")],
                )
            ]
        )
    )

    assert "BPMN-STRUCT-003" in codes(report.findings)
    assert any(item.element_id == "Lost" for item in report.findings)


def test_dead_end() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [node("Start", NodeType.START_EVENT), node("Task")],
                    [flow("F", "Start", "Task")],
                )
            ]
        )
    )

    assert "BPMN-STRUCT-004" in codes(report.findings)
    assert any(item.element_id == "Task" for item in report.findings)


def test_dangling_flow() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [node("Start", NodeType.START_EVENT), node("End", NodeType.END_EVENT)],
                    [flow("F", "Start", "Missing")],
                )
            ]
        )
    )

    assert "BPMN-STRUCT-005" in codes(report.findings)
    assert any(item.element_id == "F" for item in report.findings)


def test_duplicate_ids() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [
                        node("Start", NodeType.START_EVENT),
                        node("Task"),
                        node("Task"),
                        node("End", NodeType.END_EVENT),
                    ],
                    [flow("F1", "Start", "Task"), flow("F2", "Task", "End")],
                )
            ]
        )
    )

    duplicate = [item for item in report.findings if item.rule_id == "BPMN-STRUCT-006"]
    assert len(duplicate) == 1
    assert duplicate[0].element_id == "Task"
    assert "2 раз" in duplicate[0].message


def test_participant_without_process() -> None:
    report = ValidationEngine().validate(
        document(
            collaboration=Collaboration(
                id="Collaboration_1",
                participants=[
                    Participant(id="Pool_1", name="Валидный", process_ref="Process_1"),
                    Participant(id="Pool_2", name="Битый", process_ref="Missing"),
                    Participant(id="Pool_3", name="Без ссылки"),
                ],
            )
        )
    )

    assert "BPMN-STRUCT-007" in codes(report.findings)
    assert {item.element_id for item in report.findings if item.rule_id == "BPMN-STRUCT-007"} == {
        "Pool_2",
        "Pool_3",
    }


def test_nodes_outside_lanes_and_empty_lane() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [
                        node("Start", NodeType.START_EVENT),
                        node("Task"),
                        node("End", NodeType.END_EVENT),
                    ],
                    [flow("F1", "Start", "Task"), flow("F2", "Task", "End")],
                    lanes=[
                        Lane(id="Lane_1", flow_node_refs=["Start"]),
                        Lane(id="Lane_2", name="Пустая"),
                    ],
                )
            ]
        )
    )

    outside = [item for item in report.findings if item.rule_id == "BPMN-STRUCT-008"]
    assert {item.element_id for item in outside} == {"Task", "End"}
    assert "BPMN-STRUCT-009" in codes(report.findings)


def test_lanes_without_refs_do_not_flag_every_node() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [
                        node("Start", NodeType.START_EVENT),
                        node("Task"),
                        node("End", NodeType.END_EVENT),
                    ],
                    [flow("F1", "Start", "Task"), flow("F2", "Task", "End")],
                    lanes=[
                        Lane(id="Lane_1", name="Первая"),
                        Lane(id="Lane_2", name="Вторая"),
                    ],
                )
            ]
        )
    )

    assert "BPMN-STRUCT-008" not in codes(report.findings)
    assert {item.element_id for item in report.findings if item.rule_id == "BPMN-STRUCT-009"} == {
        "Lane_1",
        "Lane_2",
    }


def test_parent_lane_without_refs_is_not_empty_leaf() -> None:
    report = ValidationEngine().validate(
        document(
            [
                process(
                    [node("Start", NodeType.START_EVENT), node("End", NodeType.END_EVENT)],
                    [flow("F", "Start", "End")],
                    lanes=[
                        Lane(
                            id="Lane_parent",
                            child_lanes=[
                                Lane(id="Lane_child", flow_node_refs=["Start", "End"]),
                            ],
                        )
                    ],
                )
            ]
        )
    )

    assert "BPMN-STRUCT-009" not in codes(report.findings)
    assert "BPMN-STRUCT-008" not in codes(report.findings)
