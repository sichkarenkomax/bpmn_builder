"""Пространства имён и словари тегов BPMN 2.0."""

from __future__ import annotations

BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI = "http://www.omg.org/spec/BPMN/20100524/DI"
DC = "http://www.omg.org/spec/DD/20100524/DC"
DI = "http://www.omg.org/spec/DD/20100524/DI"
XSI = "http://www.w3.org/2001/XMLSchema-instance"

NSMAP = {"bpmn": BPMN, "bpmndi": BPMNDI, "dc": DC, "di": DI, "xsi": XSI}


def q(namespace: str, local_name: str) -> str:
    """Кларк-нотация: `{namespace}local`."""
    return f"{{{namespace}}}{local_name}"
