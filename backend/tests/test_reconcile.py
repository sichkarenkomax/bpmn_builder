"""Реконсиляция: правки модели поверх чужого XML без потери расширений."""

from __future__ import annotations

from pathlib import Path

from app.bpmn import (
    Bounds,
    BpmnDocument,
    Flow,
    FlowType,
    Node,
    NodeType,
    Waypoint,
    parse_bpmn,
    serialize_bpmn,
    validate_bpmn_xsd,
)

FIXTURES = Path(__file__).parent / "fixtures" / "bpmn"

VENDOR_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  xmlns:acme="https://acme.example/schema"
                  id="Definitions_acme"
                  targetNamespace="http://acme.example/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:extensionElements>
      <acme:meta version="7" />
    </bpmn:extensionElements>
    <bpmn:userTask id="Task_1" name="Старое имя">
      <bpmn:extensionElements>
        <camunda:formData>
          <camunda:formField id="amount" label="Сумма" type="long" />
        </camunda:formData>
      </bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1" acme:locked="true">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def _camunda() -> BpmnDocument:
    return parse_bpmn((FIXTURES / "camunda-simple.bpmn").read_text(encoding="utf-8"))


def _task(document: BpmnDocument, task_id: str) -> Node:
    return next(node for node in document.processes[0].nodes if node.id == task_id)


def test_untouched_document_is_returned_byte_for_byte() -> None:
    source = (FIXTURES / "camunda-simple.bpmn").read_text(encoding="utf-8")

    assert serialize_bpmn(parse_bpmn(source)) == source


def test_rename_keeps_vendor_attributes_and_extensions() -> None:
    document = parse_bpmn(VENDOR_XML)
    _task(document, "Task_1").name = "Новое имя"

    xml = serialize_bpmn(document)

    validate_bpmn_xsd(xml)
    assert 'name="Новое имя"' in xml
    assert 'acme:meta version="7"' in xml
    assert "<camunda:formData>" in xml
    assert 'acme:locked="true"' in xml
    assert parse_bpmn(xml) == document


def test_added_elements_get_geometry_and_keep_foreign_nodes() -> None:
    document = _camunda()
    document.processes[0].nodes.append(
        Node(
            id="Task_Approve",
            type=NodeType.USER_TASK,
            name="Согласовать",
            bounds=Bounds(x=430, y=270, width=100, height=80),
        )
    )
    document.processes[0].flows.append(
        Flow(
            id="Flow_3",
            type=FlowType.SEQUENCE,
            source_ref="Task_Review",
            target_ref="Task_Approve",
            waypoints=[Waypoint(x=370, y=117), Waypoint(x=430, y=310)],
        )
    )

    xml = serialize_bpmn(document)

    validate_bpmn_xsd(xml)
    assert 'id="Task_Approve"' in xml
    assert 'id="Flow_3"' in xml
    assert 'camunda:assignee="${reviewer}"' in xml
    assert 'exporterVersion="5.20.0"' in xml
    assert 'bpmnElement="Task_Approve"' in xml
    assert 'bpmnElement="Flow_3"' in xml
    assert parse_bpmn(xml) == document


def test_removed_elements_disappear_with_their_geometry() -> None:
    document = _camunda()
    process = document.processes[0]
    process.nodes = [node for node in process.nodes if node.id != "Task_Review"]
    process.flows = [flow for flow in process.flows if flow.id not in {"Flow_1", "Flow_2"}]

    xml = serialize_bpmn(document)

    validate_bpmn_xsd(xml)
    assert "Task_Review" not in xml
    assert 'id="Flow_1"' not in xml
    assert 'id="Flow_2"' not in xml
    assert "StartEvent_1" in xml and "EndEvent_1" in xml
    assert parse_bpmn(xml) == document


def test_moved_element_updates_only_its_shape() -> None:
    document = _camunda()
    process = document.processes[0]
    process.nodes = [
        node.model_copy(update={"bounds": Bounds(x=400, y=200, width=120, height=80)})
        if node.id == "Task_Review"
        else node
        for node in process.nodes
    ]

    xml = serialize_bpmn(document)

    validate_bpmn_xsd(xml)
    assert 'x="400" y="200" width="120" height="80"' in xml
    assert 'x="179" y="99" width="36" height="36"' in xml
    assert 'exporterVersion="5.20.0"' in xml
    assert parse_bpmn(xml) == document


def test_type_change_keeps_extension_elements() -> None:
    document = parse_bpmn(VENDOR_XML)
    _task(document, "Task_1").type = NodeType.SERVICE_TASK

    xml = serialize_bpmn(document)

    validate_bpmn_xsd(xml)
    assert '<bpmn:serviceTask id="Task_1"' in xml
    assert "<camunda:formData>" in xml
    assert 'acme:meta version="7"' in xml
    assert "<bpmn:userTask" not in xml
    assert parse_bpmn(xml) == document


def test_condition_is_written_in_place() -> None:
    document = _camunda()
    flow = document.processes[0].flows[1]
    flow.condition = "approved == true"

    xml = serialize_bpmn(document)

    validate_bpmn_xsd(xml)
    assert "approved == true" in xml
    assert "conditionExpression" in xml
    assert parse_bpmn(xml) == document
