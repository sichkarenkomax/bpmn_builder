"""Ошибки валидации: позиция в документе и понятный текст."""

from __future__ import annotations

import pytest
from app.bpmn import BpmnSchemaError, BpmnSyntaxError, validate_bpmn_xsd

VALID = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="Definitions_1"
                  targetNamespace="http://bpmn-studio.dev/schema">
  <bpmn:process id="Process_1" />
</bpmn:definitions>
"""


def test_valid_document_passes() -> None:
    validate_bpmn_xsd(VALID)


def test_broken_xml_reports_position() -> None:
    broken = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">\n'

    with pytest.raises(BpmnSyntaxError) as error:
        validate_bpmn_xsd(broken)

    assert error.value.line is not None


def test_unknown_child_of_process_is_rejected_with_line() -> None:
    invalid = VALID.replace(
        '  <bpmn:process id="Process_1" />',
        '  <bpmn:process id="Process_1">\n    <bpmn:notAThing id="X" />\n  </bpmn:process>',
    )

    with pytest.raises(BpmnSchemaError) as error:
        validate_bpmn_xsd(invalid)

    assert "notAThing" in error.value.message
    assert error.value.line == 6
    assert error.value.as_detail()["message"]


def test_missing_target_namespace_is_rejected() -> None:
    invalid = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D_1">
  <bpmn:process id="Process_1" />
</bpmn:definitions>
"""

    with pytest.raises(BpmnSchemaError):
        validate_bpmn_xsd(invalid)
