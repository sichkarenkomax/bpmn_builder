"""Golden-файлы: открыть, разобрать, вернуть без потерь, собрать заново.

Файлы написаны по конвенциям реальных инструментов (Camunda Modeler, Bizagi,
bpmn-js), но не являются их выгрузками — это фикстуры для проверки разбора.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest
from app.bpmn import FlowType, parse_bpmn, serialize_bpmn, validate_bpmn_xsd
from app.bpmn.normalize import normalize

FIXTURES = Path(__file__).parent / "fixtures" / "bpmn"


@dataclass(frozen=True)
class Expected:
    processes: int
    nodes: int
    flows: int
    lanes: int = 0
    artifacts: int = 0
    associations: int = 0
    participants: int = 0
    message_flows: int = 0
    #: Строки, которые обязаны остаться после сохранения без изменений.
    markers: tuple[str, ...] = field(default_factory=tuple)


EXPECTED: dict[str, Expected] = {
    "camunda-simple.bpmn": Expected(
        processes=1, nodes=3, flows=2, markers=("camunda:assignee", "exporterVersion")
    ),
    "bizagi-approval.bpmn": Expected(
        processes=1, nodes=5, flows=4, markers=("bizagi:displayName", "conditionExpression")
    ),
    "collaboration-pools.bpmn": Expected(
        processes=2,
        nodes=3,
        flows=1,
        lanes=2,
        participants=2,
        message_flows=1,
        markers=("messageFlow",),
    ),
    "subprocess-boundary.bpmn": Expected(
        processes=1, nodes=5, flows=3, markers=('isExpanded="false"', 'cancelActivity="true"')
    ),
    "gateways-conditions.bpmn": Expected(processes=1, nodes=7, flows=7),
    "artifacts-annotations.bpmn": Expected(
        processes=1, nodes=2, flows=1, artifacts=3, associations=1, markers=("categoryValue",)
    ),
    "events-intermediate.bpmn": Expected(
        processes=1,
        nodes=6,
        flows=5,
        markers=("camunda:connectorId", 'scriptFormat="groovy"'),
    ),
    "two-processes.bpmn": Expected(processes=2, nodes=3, flows=1),
    "prefixed-namespace.bpmn": Expected(
        processes=1, nodes=3, flows=2, markers=("bpmn2:definitions", "ddi:waypoint")
    ),
    "bpmnjs-empty.bpmn": Expected(processes=1, nodes=0, flows=0),
}


@pytest.mark.parametrize("filename", sorted(EXPECTED))
def test_golden_file(filename: str) -> None:
    expected = EXPECTED[filename]
    source = (FIXTURES / filename).read_text(encoding="utf-8")

    validate_bpmn_xsd(source)
    document = parse_bpmn(source)

    assert len(document.processes) == expected.processes
    assert len(document.nodes()) == expected.nodes
    assert len(document.flows()) == expected.flows
    assert sum(len(process.lanes) for process in document.processes) == expected.lanes
    assert sum(len(process.artifacts) for process in document.processes) == expected.artifacts
    assert sum(len(process.associations) for process in document.processes) == expected.associations

    collaboration = document.collaboration
    participants = len(collaboration.participants) if collaboration else 0
    message_flows = len(collaboration.message_flows) if collaboration else 0
    assert participants == expected.participants
    assert message_flows == expected.message_flows

    # 1. Сохранение без изменений — байт в байт, ни одно чужое расширение не теряется.
    assert serialize_bpmn(document) == source
    for marker in expected.markers:
        assert marker in serialize_bpmn(document)


@pytest.mark.parametrize("filename", sorted(EXPECTED))
def test_golden_file_can_be_regenerated(filename: str) -> None:
    source = (FIXTURES / filename).read_text(encoding="utf-8")
    document = parse_bpmn(source)

    # 2. Модель → XML заново (без исходника): валидно по XSD и читается обратно.
    regenerated = serialize_bpmn(document.detached())
    validate_bpmn_xsd(regenerated)
    assert parse_bpmn(regenerated) == normalize(document)


@pytest.mark.parametrize("filename", sorted(EXPECTED))
def test_golden_file_is_stable(filename: str) -> None:
    source = (FIXTURES / filename).read_text(encoding="utf-8")

    first = serialize_bpmn(parse_bpmn(source))
    second = serialize_bpmn(parse_bpmn(first))

    assert first == second == source


def test_camunda_assignee_is_readable() -> None:
    document = parse_bpmn((FIXTURES / "camunda-simple.bpmn").read_text(encoding="utf-8"))

    task = next(node for node in document.nodes() if node.id == "Task_Review")
    assert task.name == "Проверить заявку"


def test_bizagi_condition_is_extracted() -> None:
    document = parse_bpmn((FIXTURES / "bizagi-approval.bpmn").read_text(encoding="utf-8"))

    flow = next(flow for flow in document.flows() if flow.id == "Seq_Yes")
    assert flow.condition == "approved == true"
    assert flow.type is FlowType.SEQUENCE


def test_subprocess_geometry_and_boundary() -> None:
    document = parse_bpmn((FIXTURES / "subprocess-boundary.bpmn").read_text(encoding="utf-8"))

    subprocess = next(node for node in document.nodes() if node.id == "SubProcess_1")
    boundary = next(node for node in document.nodes() if node.id == "Boundary_Timeout")

    assert subprocess.is_expanded is False
    assert subprocess.bounds is not None and subprocess.bounds.width == 100
    assert boundary.attached_to == "SubProcess_1"
    assert boundary.cancel_activity is True


def test_script_and_service_tasks_roundtrip() -> None:
    document = parse_bpmn((FIXTURES / "events-intermediate.bpmn").read_text(encoding="utf-8"))

    script = next(node for node in document.nodes() if node.id == "Task_Script")
    service = next(node for node in document.nodes() if node.id == "Task_Service")

    assert script.script_format == "groovy"
    assert script.script == "def total = items.sum()"
    assert service.implementation == "CrmConnector"


def test_lanes_and_message_flow_geometry() -> None:
    document = parse_bpmn((FIXTURES / "collaboration-pools.bpmn").read_text(encoding="utf-8"))

    lane = document.processes[0].lanes[0]
    assert lane.flow_node_refs == ["Client_Start", "Client_Task"]
    assert lane.bounds is not None and lane.bounds.height == 200

    assert document.collaboration is not None
    message = document.collaboration.message_flows[0]
    assert message.source_ref == "Participant_Client"
    assert len(message.waypoints) == 2
