"""Round-trip: модель → XML → модель и обратно."""

from __future__ import annotations

from app.bpmn import BpmnDocument, parse_bpmn, serialize_bpmn, validate_bpmn_xsd
from app.bpmn.normalize import normalize
from hypothesis import HealthCheck, given, settings

from tests.strategies import bpmn_documents


@settings(max_examples=120, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(bpmn_documents())
def test_model_xml_model_is_identity(document: BpmnDocument) -> None:
    xml = serialize_bpmn(document)

    validate_bpmn_xsd(xml)
    parsed = parse_bpmn(xml)

    assert parsed == normalize(document)


@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(bpmn_documents())
def test_serialization_is_stable(document: BpmnDocument) -> None:
    first = serialize_bpmn(document)
    second = serialize_bpmn(parse_bpmn(first))

    assert first == second


@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(bpmn_documents())
def test_text_escapes_symmetrically(document: BpmnDocument) -> None:
    xml = serialize_bpmn(document)
    parsed = parse_bpmn(xml)

    original_names = [node.name for node in document.nodes()]
    parsed_names = [node.name for node in parsed.nodes()]

    assert sorted(filter(None, original_names)) == sorted(filter(None, parsed_names))
