"""Экспорт BPMN-документа в форматы для аудита, RACI и печати.

SVG/PNG/BPMN XML отдаёт браузер: там уже есть точная геометрия bpmn-js.
Сервер формирует документы, которым нужна табличная или офисная упаковка.
"""

from __future__ import annotations

import base64
import binascii
import csv
import io
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Literal

from docx import Document as DocxDocument
from openpyxl import Workbook  # type: ignore[import-untyped]
from PIL import Image, UnidentifiedImageError
from reportlab.pdfbase import pdfmetrics  # type: ignore[import-untyped]
from reportlab.pdfbase.ttfonts import TTFont  # type: ignore[import-untyped]
from reportlab.pdfgen import canvas as pdf_canvas  # type: ignore[import-untyped]
from svglib.svglib import register_font as register_svg_font
from svglib.svglib import svg2rlg

from app.bpmn import parse_and_validate_bpmn

ExportFormat = Literal["json", "csv", "xlsx", "docx", "pdf"]
PdfPage = Literal["A4", "A3"]
PdfOrientation = Literal["portrait", "landscape"]

_MEDIA_TYPES: dict[ExportFormat, str] = {
    "json": "application/json",
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}

_EXTENSIONS: dict[ExportFormat, str] = {
    "json": "json",
    "csv": "csv",
    "xlsx": "xlsx",
    "docx": "docx",
    "pdf": "pdf",
}

_COLUMNS = [
    "Процесс",
    "Тип",
    "ID",
    "Название",
    "Документация",
    "Источник",
    "Цель",
    "Условие",
]

# 150 dpi: достаточно для печати A4/A3 и не раздувает PDF до десятков мегабайт.
_PAGE_PIXELS: dict[PdfPage, tuple[int, int]] = {
    "A4": (1240, 1754),
    "A3": (1754, 2480),
}
_PAGE_POINTS: dict[PdfPage, tuple[float, float]] = {
    "A4": (595.276, 841.89),
    "A3": (841.89, 1190.551),
}
_PDF_DPI = 150
_PDF_PADDING = 18.0
_FONT_DIR = Path(__file__).with_name("fonts")
_VECTOR_FONT = "BPMNStudioSans"
_VECTOR_FONT_FAMILY = "DejaVu Sans"


def _register_vector_fonts() -> bool:
    """Регистрирует DejaVu Sans: без неё reportlab теряет кириллицу."""
    regular = _FONT_DIR / "DejaVuSans.ttf"
    bold = _FONT_DIR / "DejaVuSans-Bold.ttf"
    if not regular.is_file() or not bold.is_file():
        return False
    try:
        pdfmetrics.registerFont(TTFont(_VECTOR_FONT, str(regular)))
        pdfmetrics.registerFont(TTFont(f"{_VECTOR_FONT}-Bold", str(bold)))
        register_svg_font(_VECTOR_FONT_FAMILY, str(regular), rlgFontName=_VECTOR_FONT)
        register_svg_font(
            _VECTOR_FONT_FAMILY,
            str(bold),
            weight="bold",
            rlgFontName=f"{_VECTOR_FONT}-Bold",
        )
    except Exception:
        return False
    return True


_VECTOR_FONTS_READY = _register_vector_fonts()


def export_document(
    xml: str,
    fmt: ExportFormat,
    *,
    png_base64: str | None = None,
    svg: str | None = None,
    page: PdfPage = "A4",
    orientation: PdfOrientation = "portrait",
) -> tuple[bytes, str, str]:
    """Возвращает содержимое, media type и расширение файла."""
    document, _root = parse_and_validate_bpmn(xml)

    if fmt == "json":
        payload = document.model_dump_json(indent=2).encode("utf-8")
    elif fmt == "csv":
        payload = _csv_bytes(_rows(document))
    elif fmt == "xlsx":
        payload = _xlsx_bytes(document.id, _rows(document))
    elif fmt == "docx":
        payload = _docx_bytes(document.id, document.target_namespace, _rows(document))
    else:
        if svg:
            try:
                payload = _svg_pdf_bytes(svg, page=page, orientation=orientation)
            except ValueError:
                if not png_base64:
                    raise
                payload = _pdf_bytes(png_base64, page=page, orientation=orientation)
        elif png_base64:
            payload = _pdf_bytes(png_base64, page=page, orientation=orientation)
        else:
            msg = "для PDF нужен SVG или PNG текущего холста"
            raise ValueError(msg)

    return payload, _MEDIA_TYPES[fmt], _EXTENSIONS[fmt]


def _rows(document: object) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    processes = getattr(document, "processes", [])
    for process in processes:
        process_name = process.name or process.id
        for lane in process.lanes:
            rows.append(_row(process_name, "Дорожка", lane.id, lane.name, lane.documentation))
        for node in process.nodes:
            details = _node_details(node)
            rows.append(
                _row(
                    process_name,
                    node.type.value,
                    node.id,
                    node.name,
                    node.documentation,
                    details=details,
                )
            )
        for flow in [*process.flows, *process.associations]:
            rows.append(
                _row(
                    process_name,
                    flow.type.value,
                    flow.id,
                    flow.name,
                    flow.documentation,
                    source=flow.source_ref,
                    target=flow.target_ref,
                    condition=flow.condition,
                )
            )
        for artifact in process.artifacts:
            rows.append(
                _row(
                    process_name,
                    artifact.type.value,
                    artifact.id,
                    artifact.name,
                    artifact.documentation,
                    condition=artifact.text,
                )
            )

    collaboration = getattr(document, "collaboration", None)
    if collaboration is not None:
        for participant in collaboration.participants:
            rows.append(
                _row(
                    collaboration.id,
                    "participant",
                    participant.id,
                    participant.name,
                    None,
                    condition=participant.process_ref,
                )
            )
        for flow in collaboration.message_flows:
            rows.append(
                _row(
                    collaboration.id,
                    flow.type.value,
                    flow.id,
                    flow.name,
                    flow.documentation,
                    source=flow.source_ref,
                    target=flow.target_ref,
                    condition=flow.condition,
                )
            )
    return rows


def _row(
    process: str,
    kind: str,
    element_id: str,
    name: str | None,
    documentation: str | None,
    *,
    source: str = "",
    target: str = "",
    condition: str | None = None,
    details: str = "",
) -> dict[str, str]:
    return {
        "Процесс": process,
        "Тип": kind,
        "ID": element_id,
        "Название": name or "",
        "Документация": _one_line(documentation),
        "Источник": source,
        "Цель": target,
        "Условие": _one_line(condition or details),
    }


def _node_details(node: object) -> str:
    parts: list[str] = []
    implementation = getattr(node, "implementation", None)
    attached_to = getattr(node, "attached_to", None)
    script = getattr(node, "script", None)
    if implementation:
        parts.append(f"implementation={implementation}")
    if attached_to:
        parts.append(f"attachedTo={attached_to}")
    if script:
        parts.append(f"script={script}")
    return "; ".join(parts)


def _one_line(value: str | None) -> str:
    return " ".join((value or "").split())


def _csv_bytes(rows: Iterable[dict[str, str]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    # BOM помогает Excel открыть кириллицу без «кракозябр».
    return buffer.getvalue().encode("utf-8-sig")


def _xlsx_bytes(title: str, rows: list[dict[str, str]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Реестр элементов"[:31]
    sheet.append(_COLUMNS)
    for row in rows:
        sheet.append([row[column] for column in _COLUMNS])
    sheet.freeze_panes = "A2"
    widths = [24, 22, 28, 36, 50, 24, 24, 36]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[chr(64 + index)].width = width
    sheet.auto_filter.ref = sheet.dimensions
    sheet.sheet_properties.title = title
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _docx_bytes(title: str, namespace: str, rows: list[dict[str, str]]) -> bytes:
    document = DocxDocument()
    document.add_heading("Паспорт процесса", level=0)
    document.add_paragraph(f"Документ: {title}")
    document.add_paragraph(f"Пространство имён: {namespace}")
    document.add_paragraph(f"Элементов в реестре: {len(rows)}")

    table = document.add_table(rows=1, cols=len(_COLUMNS))
    table.style = "Table Grid"
    header = table.rows[0].cells
    for index, column in enumerate(_COLUMNS):
        header[index].text = column
    for row in rows:
        cells = table.add_row().cells
        for index, column in enumerate(_COLUMNS):
            cells[index].text = row[column]

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _svg_pdf_bytes(
    svg: str,
    *,
    page: PdfPage,
    orientation: PdfOrientation,
) -> bytes:
    """Векторный PDF из SVG холста; при несовместимом SVG — ValueError.

    headless Chromium не нужен: svglib/reportlab сохраняют фигуры и текст
    вектором и умеют разбивать высокую схему на страницы.
    """
    # bpmn-js добавляет стандартный DOCTYPE SVG 1.1; он безопасен при
    # resolve_entities=False. Внутренний subset и ENTITY не принимаем.
    if "<!ENTITY" in svg or re.search(r"<!DOCTYPE[^>]*\[", svg, re.IGNORECASE):
        raise ValueError("SVG с DTD-сущностями не поддерживается")
    if _VECTOR_FONTS_READY:
        # bpmn-js может не писать font-family, а computed style даёт Arial.
        # Оба варианта без DejaVu Sans превращают кириллицу в квадраты.
        svg = re.sub(
            r'font-family\s*=\s*"[^"]*"',
            f'font-family="{_VECTOR_FONT_FAMILY}"',
            svg,
        )
        svg = re.sub(
            r"font-family\s*:\s*[^;\"']+",
            f"font-family: {_VECTOR_FONT_FAMILY}",
            svg,
        )
        svg = re.sub(
            r"<text\b(?![^>]*\bfont-family=)",
            f'<text font-family="{_VECTOR_FONT_FAMILY}"',
            svg,
        )
    try:
        drawing = svg2rlg(io.BytesIO(svg.encode("utf-8")), external_reference_root="/nonexistent")
    except Exception as exc:  # svglib кидает разные ошибки разбора
        raise ValueError("не удалось разобрать SVG холста") from exc
    if drawing is None or drawing.width <= 0 or drawing.height <= 0:
        raise ValueError("SVG холста пустой")

    width, height = _PAGE_POINTS[page]
    if orientation == "landscape":
        width, height = height, width
    available_width = width - 2 * _PDF_PADDING
    available_height = height - 2 * _PDF_PADDING
    scale = available_width / drawing.width
    scaled_height = drawing.height * scale
    pages = max(1, int(-(-scaled_height // available_height)))

    buffer = io.BytesIO()
    pdf = pdf_canvas.Canvas(buffer, pagesize=(width, height), pageCompression=1)
    try:
        drawing.scale(scale, scale)
        for index in range(pages):
            if pages == 1:
                y = (height - scaled_height) / 2
            else:
                y = height - _PDF_PADDING - scaled_height - index * available_height
            drawing.drawOn(pdf, _PDF_PADDING, y)
            pdf.showPage()
        pdf.save()
    except Exception as exc:  # несовместимый SVG не должен ломать экспорт
        raise ValueError("SVG холста не удалось перевести в PDF") from exc
    return buffer.getvalue()


def _pdf_bytes(
    png_base64: str,
    *,
    page: PdfPage,
    orientation: PdfOrientation,
) -> bytes:
    try:
        raw = base64.b64decode(png_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("PNG передан в некорректном base64") from exc

    try:
        with Image.open(io.BytesIO(raw)) as source:
            image = source.convert("RGB")
    except UnidentifiedImageError as exc:
        raise ValueError("не удалось прочитать PNG холста") from exc

    pages = _paginate(image, page=page, orientation=orientation)
    buffer = io.BytesIO()
    first, *rest = pages
    first.save(
        buffer,
        format="PDF",
        save_all=True,
        append_images=rest,
        resolution=float(_PDF_DPI),
    )
    return buffer.getvalue()


def _paginate(
    image: Image.Image, *, page: PdfPage, orientation: PdfOrientation
) -> list[Image.Image]:
    width, height = _PAGE_PIXELS[page]
    if orientation == "landscape":
        width, height = height, width

    # Вписываем по ширине: диаграмма читается лучше, чем уменьшенная до entire page.
    scale = min(1.0, width / image.width) if image.width else 1.0
    if image.width < width:
        scale = width / image.width
    scaled_width = max(1, round(image.width * scale))
    scaled_height = max(1, round(image.height * scale))
    scaled = image.resize((scaled_width, scaled_height), Image.Resampling.LANCZOS)

    if scaled_height <= height:
        canvas = Image.new("RGB", (width, height), "white")
        canvas.paste(scaled, ((width - scaled_width) // 2, (height - scaled_height) // 2))
        return [canvas]

    pages: list[Image.Image] = []
    top = 0
    while top < scaled_height:
        strip = scaled.crop((0, top, min(scaled_width, width), min(top + height, scaled_height)))
        canvas = Image.new("RGB", (width, height), "white")
        canvas.paste(strip, (0, 0))
        pages.append(canvas)
        top += height
    return pages


__all__ = ["ExportFormat", "PdfOrientation", "PdfPage", "export_document"]
