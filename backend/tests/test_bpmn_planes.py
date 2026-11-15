"""Генерация диаграмм с пулами: одна плоскость, как ждут инструменты."""

from __future__ import annotations

from app.bpmn import (
    BpmnDocument,
    Collaboration,
    Node,
    NodeType,
    Participant,
    Process,
    serialize_bpmn,
    validate_bpmn_xsd,
)
from app.bpmn.model import Bounds, Flow, FlowType, Waypoint
from app.bpmn.namespaces import BPMNDI, q
from lxml import etree


def _document() -> BpmnDocument:
    client_node = Node(
        id="Client_Task",
        type=NodeType.USER_TASK,
        bounds=Bounds(x=200, y=100, width=100, height=80),
    )
    bank_node = Node(
        id="Bank_Task",
        type=NodeType.SERVICE_TASK,
        bounds=Bounds(x=200, y=400, width=100, height=80),
    )
    return BpmnDocument(
        id="Definitions_Pools",
        processes=[
            Process(
                id="Process_Client",
                nodes=[client_node],
                lanes=[],
                plane_id="BPMNPlane_Client",
                diagram_id="BPMNDiagram_Client",
            ),
            Process(
                id="Process_Bank",
                nodes=[bank_node],
                plane_id="BPMNPlane_Bank",
                diagram_id="BPMNDiagram_Bank",
            ),
        ],
        collaboration=Collaboration(
            id="Collaboration_1",
            participants=[
                Participant(
                    id="Participant_Client",
                    process_ref="Process_Client",
                    bounds=Bounds(x=160, y=60, width=600, height=200),
                ),
                Participant(
                    id="Participant_Bank",
                    process_ref="Process_Bank",
                    bounds=Bounds(x=160, y=360, width=600, height=200),
                ),
            ],
            message_flows=[
                Flow(
                    id="Message_1",
                    type=FlowType.MESSAGE,
                    source_ref="Participant_Client",
                    target_ref="Participant_Bank",
                    waypoints=[Waypoint(x=400, y=260), Waypoint(x=400, y=360)],
                )
            ],
        ),
    )


def test_pools_are_rendered_in_one_plane() -> None:
    xml = serialize_bpmn(_document())
    validate_bpmn_xsd(xml)

    root = etree.fromstring(xml.encode())
    diagrams = root.findall(f".//{q(BPMNDI, 'BPMNDiagram')}")
    planes = root.findall(f".//{q(BPMNDI, 'BPMNPlane')}")

    assert len(diagrams) == 1, "bpmn-js показывает только первую плоскость"
    assert len(planes) == 1
    assert planes[0].get("bpmnElement") == "Collaboration_1"

    shape_refs = {shape.get("bpmnElement") for shape in planes[0].findall(q(BPMNDI, "BPMNShape"))}
    edge_refs = {edge.get("bpmnElement") for edge in planes[0].findall(q(BPMNDI, "BPMNEdge"))}

    assert {"Participant_Client", "Participant_Bank"} <= shape_refs
    assert {"Client_Task", "Bank_Task"} <= shape_refs
    assert "Message_1" in edge_refs


def test_process_without_pools_keeps_own_plane() -> None:
    document = _document()
    document.collaboration = None

    xml = serialize_bpmn(document)
    root = etree.fromstring(xml.encode())

    planes = root.findall(f".//{q(BPMNDI, 'BPMNPlane')}")
    assert len(planes) == 2
    assert {plane.get("bpmnElement") for plane in planes} == {"Process_Client", "Process_Bank"}

    # Процесс без пулов не теряет свои фигуры.
    assert any(
        shape.get("bpmnElement") == "Client_Task"
        for shape in root.findall(f".//{q(BPMNDI, 'BPMNShape')}")
    )
