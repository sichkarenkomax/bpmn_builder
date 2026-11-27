"""Раскрытый подпроцесс: вложенные узлы и потоки в модели и round-trip XML."""

from __future__ import annotations

from app.bpmn import BpmnDocument, parse_bpmn, serialize_bpmn, validate_bpmn_xsd
from app.bpmn.model import Node
from app.bpmn.normalize import normalize

XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_Sub"
                  targetNamespace="http://bpmn-studio.dev/schema">
  <bpmn:process id="Process_Sub" name="Проверка" isExecutable="false">
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_To_Sub</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="Sub_1" name="Проверка документов">
      <bpmn:incoming>Flow_To_Sub</bpmn:incoming>
      <bpmn:outgoing>Flow_Ok</bpmn:outgoing>
      <bpmn:startEvent id="Sub_Start">
        <bpmn:outgoing>Sub_F1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="Sub_Task" name="Сверить">
        <bpmn:incoming>Sub_F1</bpmn:incoming>
        <bpmn:outgoing>Sub_F2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:subProcess id="Sub_Inner" name="Глубже">
        <bpmn:incoming>Sub_F2</bpmn:incoming>
        <bpmn:outgoing>Sub_F3</bpmn:outgoing>
        <bpmn:startEvent id="Deep_Start">
          <bpmn:outgoing>Deep_F1</bpmn:outgoing>
        </bpmn:startEvent>
        <bpmn:scriptTask id="Deep_Task" name="Посчитать" scriptFormat="javascript">
          <bpmn:incoming>Deep_F1</bpmn:incoming>
          <bpmn:outgoing>Deep_F2</bpmn:outgoing>
          <bpmn:script>total = total + 1</bpmn:script>
        </bpmn:scriptTask>
        <bpmn:endEvent id="Deep_End">
          <bpmn:incoming>Deep_F2</bpmn:incoming>
        </bpmn:endEvent>
        <bpmn:sequenceFlow id="Deep_F1" sourceRef="Deep_Start" targetRef="Deep_Task" />
        <bpmn:sequenceFlow id="Deep_F2" sourceRef="Deep_Task" targetRef="Deep_End" />
      </bpmn:subProcess>
      <bpmn:exclusiveGateway id="Sub_Gate">
        <bpmn:incoming>Sub_F3</bpmn:incoming>
        <bpmn:outgoing>Sub_F4</bpmn:outgoing>
      </bpmn:exclusiveGateway>
      <bpmn:endEvent id="Sub_End">
        <bpmn:incoming>Sub_F4</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="Sub_F1" sourceRef="Sub_Start" targetRef="Sub_Task" />
      <bpmn:sequenceFlow id="Sub_F2" sourceRef="Sub_Task" targetRef="Sub_Inner" />
      <bpmn:sequenceFlow id="Sub_F3" sourceRef="Sub_Inner" targetRef="Sub_Gate" />
      <bpmn:sequenceFlow id="Sub_F4" sourceRef="Sub_Gate" targetRef="Sub_End" />
    </bpmn:subProcess>
    <bpmn:endEvent id="End_Ok">
      <bpmn:incoming>Flow_Ok</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_To_Sub" sourceRef="Start_1" targetRef="Sub_1" />
    <bpmn:sequenceFlow id="Flow_Ok" sourceRef="Sub_1" targetRef="End_Ok" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_Sub">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="100" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1" isExpanded="true">
        <dc:Bounds x="190" y="78" width="500" height="220" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_Start_di" bpmnElement="Sub_Start">
        <dc:Bounds x="210" y="110" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_Task_di" bpmnElement="Sub_Task">
        <dc:Bounds x="280" y="88" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_Inner_di" bpmnElement="Sub_Inner" isExpanded="true">
        <dc:Bounds x="320" y="180" width="240" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Deep_Start_di" bpmnElement="Deep_Start">
        <dc:Bounds x="340" y="205" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Deep_Task_di" bpmnElement="Deep_Task">
        <dc:Bounds x="400" y="183" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Deep_End_di" bpmnElement="Deep_End">
        <dc:Bounds x="520" y="205" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_Gate_di" bpmnElement="Sub_Gate">
        <dc:Bounds x="590" y="88" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_End_di" bpmnElement="Sub_End">
        <dc:Bounds x="680" y="95" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_Ok_di" bpmnElement="End_Ok">
        <dc:Bounds x="760" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_To_Sub_di" bpmnElement="Flow_To_Sub">
        <di:waypoint x="136" y="118" />
        <di:waypoint x="190" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Sub_F1_di" bpmnElement="Sub_F1">
        <di:waypoint x="246" y="128" />
        <di:waypoint x="280" y="128" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Sub_F2_di" bpmnElement="Sub_F2">
        <di:waypoint x="330" y="168" />
        <di:waypoint x="380" y="168" />
        <di:waypoint x="380" y="230" />
        <di:waypoint x="400" y="230" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Deep_F1_di" bpmnElement="Deep_F1">
        <di:waypoint x="376" y="223" />
        <di:waypoint x="400" y="223" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Deep_F2_di" bpmnElement="Deep_F2">
        <di:waypoint x="500" y="223" />
        <di:waypoint x="520" y="223" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Sub_F3_di" bpmnElement="Sub_F3">
        <di:waypoint x="560" y="230" />
        <di:waypoint x="615" y="230" />
        <di:waypoint x="615" y="138" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Sub_F4_di" bpmnElement="Sub_F4">
        <di:waypoint x="640" y="113" />
        <di:waypoint x="680" y="113" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Ok_di" bpmnElement="Flow_Ok">
        <di:waypoint x="690" y="118" />
        <di:waypoint x="760" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""

SUB_NODES = ["Sub_Start", "Sub_Task", "Sub_Inner", "Sub_Gate", "Sub_End"]
DEEP_NODES = ["Deep_Start", "Deep_Task", "Deep_End"]


def _subprocess(document: BpmnDocument) -> Node:
    return next(node for node in document.nodes() if node.id == "Sub_1")


def test_nested_nodes_and_flows_are_parsed() -> None:
    document = parse_bpmn(XML)
    subprocess = _subprocess(document)

    assert subprocess.is_expanded is True
    assert [node.id for node in subprocess.nodes] == SUB_NODES
    assert [flow.id for flow in subprocess.flows] == ["Sub_F1", "Sub_F2", "Sub_F3", "Sub_F4"]

    inner = next(node for node in subprocess.nodes if node.id == "Sub_Inner")
    assert [node.id for node in inner.nodes] == DEEP_NODES
    assert [flow.id for flow in inner.flows] == ["Deep_F1", "Deep_F2"]
    script = next(node for node in inner.nodes if node.id == "Deep_Task")
    assert script.script == "total = total + 1"

    assert {node.id for node in document.all_nodes()} == {
        "Start_1",
        "Sub_1",
        "End_Ok",
        *SUB_NODES,
        *DEEP_NODES,
    }
    assert len(document.all_flows()) == 8
    # Верхнеуровневые списки не смешиваются с вложенными элементами.
    assert [node.id for node in document.nodes()] == ["Start_1", "Sub_1", "End_Ok"]
    assert [flow.id for flow in document.flows()] == ["Flow_To_Sub", "Flow_Ok"]


def test_unchanged_document_is_returned_byte_for_byte() -> None:
    document = parse_bpmn(XML)

    assert serialize_bpmn(document) == XML


def test_detached_roundtrip_keeps_nested_elements() -> None:
    document = parse_bpmn(XML).detached()

    xml = serialize_bpmn(document)
    validate_bpmn_xsd(xml)
    parsed = parse_bpmn(xml)

    assert parsed == normalize(document)
    subprocess = _subprocess(parsed)
    assert [node.id for node in subprocess.nodes] == SUB_NODES
    assert [flow.id for flow in subprocess.flows] == ["Sub_F1", "Sub_F2", "Sub_F3", "Sub_F4"]


def test_nested_change_survives_reconcile() -> None:
    document = parse_bpmn(XML)
    subprocess = _subprocess(document)
    inner = next(node for node in subprocess.nodes if node.id == "Sub_Inner")
    task = next(node for node in inner.nodes if node.id == "Deep_Task")
    task.name = "Пересчитать"

    xml = serialize_bpmn(document)

    assert 'name="Пересчитать"' in xml
    parsed = parse_bpmn(xml)
    parsed_inner = next(node for node in _subprocess(parsed).nodes if node.id == "Sub_Inner")
    assert "Deep_Task" in [node.id for node in parsed_inner.nodes]
    assert [flow.id for flow in parsed_inner.flows] == ["Deep_F1", "Deep_F2"]
