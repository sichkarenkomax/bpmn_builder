"""Валидация XML по официальной XSD BPMN 2.0 (OMG 20100501)."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from lxml import etree

from app.bpmn.errors import BpmnSchemaError, BpmnSyntaxError

SCHEMA_PATH = Path(__file__).parent / "schemas" / "BPMN20.xsd"


@lru_cache(maxsize=1)
def _schema() -> etree.XMLSchema:
    document = etree.parse(str(SCHEMA_PATH))
    return etree.XMLSchema(document)


def validate_bpmn_xsd(xml: str | bytes) -> None:
    """Бросает `BpmnSchemaError` с координатами первой ошибки."""
    raw = xml.encode("utf-8") if isinstance(xml, str) else xml
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    try:
        root = etree.fromstring(raw, parser=parser)
    except etree.XMLSyntaxError as exc:
        raise BpmnSyntaxError(str(exc), line=exc.lineno, column=exc.offset) from exc

    # С объявлением DTD и внешними сущностями схема падает внутренней ошибкой
    # lxml (и это же — вектор XXE), поэтому отклоняем документ до валидации.
    if _doctype(root):
        raise BpmnSyntaxError(
            "DTD и внешние сущности не поддерживаются",
            line=_line(root),
            column=None,
        )

    schema = _schema()
    try:
        valid = schema.validate(root)
    except etree.XMLSchemaError as exc:
        raise BpmnSyntaxError(f"XML не удалось проверить по схеме: {exc}") from exc
    if valid:
        return

    line, column, message = _first_error(str(schema.error_log))
    raise BpmnSchemaError(
        f"XML не соответствует схеме BPMN 2.0: {message}", line=line, column=column
    )


_ERROR_LINE = re.compile(r"^[^:]*:(?P<line>\d+):(?P<column>\d+):ERROR:[^:]*:(?P<message>.+)$")


def _doctype(root: etree._Element) -> bool:
    # Стабы lxml не аннотируют docinfo.doctype — проверяем тип сами.
    doctype: object = getattr(root.getroottree().docinfo, "doctype", "")
    return isinstance(doctype, str) and doctype != ""


def _line(element: etree._Element) -> int | None:
    line: object = element.sourceline
    return line if isinstance(line, int) else None


def _first_error(log: str) -> tuple[int | None, int | None, str]:
    """lxml не даёт типизированного доступа к записям лога — разбираем текст.

    Формат строки: `file:line:column:ERROR:CODE:MESSAGE`.
    """
    for raw in log.splitlines():
        if not raw.strip():
            continue
        match = _ERROR_LINE.match(raw.strip())
        if match:
            return (
                int(match.group("line")),
                int(match.group("column")),
                match.group("message").strip(),
            )
        return None, None, raw.strip()
    return None, None, "неизвестная ошибка схемы"
