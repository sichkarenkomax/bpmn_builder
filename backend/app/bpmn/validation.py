"""Одна проверка сохранения: XSD и модель используют общее дерево XML."""

from __future__ import annotations

from lxml import etree

from app.bpmn.model import BpmnDocument
from app.bpmn.parse import parse_bpmn
from app.bpmn.xsd import parse_xml, validate_root


def parse_and_validate_bpmn(xml: str | bytes) -> tuple[BpmnDocument, etree._Element]:
    """Разбирает XML один раз, валидирует по XSD и строит модель.

    Возвращает дерево вместе с моделью: вызывающий код может посчитать ETag
    или извлечь данные без повторного `fromstring`.
    """
    root = parse_xml(xml)
    validate_root(root)
    document = parse_bpmn(xml, root=root)
    return document, root


__all__ = ["parse_and_validate_bpmn"]
