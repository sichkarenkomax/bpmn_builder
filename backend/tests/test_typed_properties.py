"""Кастомные атрибуты с типами (bs:type на camunda:property) — задача 1.3.6."""

from __future__ import annotations

from app.bpmn import parse_bpmn, serialize_bpmn
from app.bpmn.xsd import validate_bpmn_xsd

TYPED_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  xmlns:bs="https://bpmn-studio.dev/schema/1.0"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1" name="Задача">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="sla" value="42" bs:type="number" />
          <camunda:property name="когда" value="2026-12-31" bs:type="date" />
          <camunda:property name="wiki" value="https://example.com" bs:type="link" />
          <camunda:property name="заметка" value="просто строка" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def test_typed_properties_pass_xsd() -> None:
    validate_bpmn_xsd(TYPED_XML)


def test_typed_properties_survive_roundtrip() -> None:
    document = parse_bpmn(TYPED_XML)
    assert serialize_bpmn(document) == TYPED_XML
