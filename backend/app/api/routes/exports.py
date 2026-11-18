"""Экспорт диаграмм: серверные документы и таблицы."""

from __future__ import annotations

from typing import Any, Literal
from urllib.parse import quote

from app.api.deps import get_session
from app.bpmn import BpmnDocument, BpmnError, parse_and_validate_bpmn, serialize_bpmn
from app.db.models import Diagram
from app.export import ExportFormat, export_document
from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/diagrams", tags=["exports"])

MAX_EXPORT_XML_BYTES = 5 * 1024 * 1024
MAX_PNG_BASE64_CHARS = 24 * 1024 * 1024


class ExportRequest(BaseModel):
    xml: str = Field(min_length=1)
    png_base64: str | None = None
    page: Literal["A4", "A3"] = "A4"
    orientation: Literal["portrait", "landscape"] = "portrait"


@router.post(
    "/{diagram_id}/exports/{fmt}",
    responses={
        200: {
            "content": {
                "application/json": {},
                "text/csv": {},
                "application/pdf": {},
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {},
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {},
            }
        }
    },
)
async def export_diagram(
    diagram_id: str,
    fmt: ExportFormat,
    payload: ExportRequest,
    session: AsyncSession = Depends(get_session),
) -> Response:
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")

    if len(payload.xml.encode("utf-8")) > MAX_EXPORT_XML_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="XML больше 5 МиБ"
        )
    if payload.png_base64 and len(payload.png_base64) > MAX_PNG_BASE64_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="PNG холста слишком большой"
        )

    try:
        content, media_type, extension = export_document(
            payload.xml,
            fmt,
            png_base64=payload.png_base64,
            page=payload.page,
            orientation=payload.orientation,
        )
    except BpmnError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": type(exc).__name__, **exc.as_detail()},
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    safe_title = _ascii_filename(diagram.title) or f"diagram-{diagram.id}"
    fallback = f"{safe_title}.{extension}"
    encoded = quote(f"{diagram.title}.{extension}")
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"
            ),
            "Cache-Control": "no-store",
        },
    )


@router.post(
    "/{diagram_id}/imports/json",
    responses={200: {"content": {"application/xml": {}}}},
)
async def import_json(
    diagram_id: str,
    payload: dict[str, Any] = Body(...),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Превращает JSON-модель (в формате экспорта) обратно в BPMN XML."""
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")
    try:
        document = BpmnDocument.model_validate(payload)
        xml = serialize_bpmn(document.detached())
        parse_and_validate_bpmn(xml)
    except (ValidationError, BpmnError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "JsonImportError", "message": str(exc)},
        ) from exc
    return Response(content=xml, media_type="application/xml")


def _ascii_filename(value: str) -> str:
    return "".join(
        char if char.isascii() and (char.isalnum() or char in "-_.") else "-" for char in value
    ).strip("-.")[:80]


__all__ = ["MAX_EXPORT_XML_BYTES", "router"]
