"""DOCX-отчёт валидации — задача 2.4.2.

Отчёт содержит шапку диаграммы, сводку и таблицу findings со ссылками на
элементы (id и имя). Форматирование минимальное: таблица Word и пара абзацев,
кириллица поддерживается стандартными шрифтами DOCX.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime

from docx import Document as DocxDocument
from docx.shared import Pt

from app.schemas.validation import ValidationReport

_SEVERITY_LABEL = {"error": "Ошибка", "warning": "Предупреждение", "info": "Информация"}
_COLUMNS = ("Важность", "Правило", "Элемент", "Сообщение", "Подсказка")


def _element_reference(finding: object) -> str:
    element_id = getattr(finding, "element_id", None)
    element_name = getattr(finding, "element_name", None)
    if element_id and element_name and element_name != element_id:
        return f"{element_name} ({element_id})"
    return element_id or "схема"


def build_validation_docx(
    report: ValidationReport,
    *,
    diagram_title: str,
    diagram_id: str,
    generated_at: datetime | None = None,
) -> bytes:
    """Собирает DOCX в памяти; внешние ссылки и макросы не используются."""
    document = DocxDocument()
    document.add_heading("Отчёт о проверке процесса", level=0)
    document.add_paragraph(f"Диаграмма: {diagram_title}")
    document.add_paragraph(f"Идентификатор: {diagram_id}")
    moment = generated_at or datetime.now(UTC)
    document.add_paragraph(f"Дата проверки: {moment:%d.%m.%Y %H:%M} UTC")
    status = "ошибок нет" if report.valid else "есть ошибки"
    document.add_paragraph(
        f"Итог: {status}; ошибок — {report.summary.errors}, "
        f"предупреждений — {report.summary.warnings}, "
        f"информации — {report.summary.infos}."
    )
    if report.config_errors:
        document.add_paragraph("Замечания к конфигу правил:")
        for message in report.config_errors:
            document.add_paragraph(message, style="List Bullet")

    if not report.findings:
        document.add_paragraph("Находок нет.")
    else:
        table = document.add_table(rows=1, cols=len(_COLUMNS))
        table.style = "Table Grid"
        for index, label in enumerate(_COLUMNS):
            cell = table.rows[0].cells[index]
            cell.text = label
            for run in cell.paragraphs[0].runs:
                run.bold = True
        for finding in report.findings:
            cells = table.add_row().cells
            cells[0].text = _SEVERITY_LABEL[finding.severity]
            cells[1].text = finding.rule_id
            cells[2].text = _element_reference(finding)
            cells[3].text = finding.message
            cells[4].text = finding.hint or "—"

    footer = document.add_paragraph(
        f"Схема контракта: {report.schema_version}; проверка {report.duration_ms:.1f} мс."
    )
    for run in footer.runs:
        run.font.size = Pt(9)

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


__all__ = ["build_validation_docx"]
