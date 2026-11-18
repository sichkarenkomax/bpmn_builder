"""Экспорт диаграмм: серверные документы и таблицы."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from urllib.parse import quote

from app.api.deps import get_session
from app.bpmn import BpmnDocument, BpmnError, parse_and_validate_bpmn, serialize_bpmn
from app.db.models import Diagram
from app.export import ExportFormat, export_document
from app.export.jobs import ExportJob, export_jobs
from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/diagrams", tags=["exports"])

MAX_EXPORT_XML_BYTES = 5 * 1024 * 1024
MAX_PNG_BASE64_CHARS = 24 * 1024 * 1024
MAX_SVG_CHARS = 12 * 1024 * 1024


class ExportRequest(BaseModel):
    xml: str = Field(min_length=1)
    png_base64: str | None = None
    svg: str | None = None
    page: Literal["A4", "A3"] = "A4"
    orientation: Literal["portrait", "landscape"] = "portrait"


class ExportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    diagram_id: str
    format: ExportFormat
    status: Literal["queued", "running", "done", "failed"]
    progress: int
    error: str | None
    size: int
    created_at: datetime
    finished_at: datetime | None


def _check_export_payload(payload: ExportRequest) -> None:
    if len(payload.xml.encode("utf-8")) > MAX_EXPORT_XML_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="XML больше 5 МиБ"
        )
    if payload.png_base64 and len(payload.png_base64) > MAX_PNG_BASE64_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="PNG холста слишком большой"
        )
    if payload.svg and len(payload.svg) > MAX_SVG_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="SVG холста слишком большой"
        )


@router.post(
    "/{diagram_id}/exports/{fmt}/jobs",
    response_model=ExportJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_export_job(
    diagram_id: str,
    fmt: ExportFormat,
    payload: ExportRequest,
    session: AsyncSession = Depends(get_session),
) -> ExportJob:
    """Ставит тяжёлую выгрузку в очередь, чтобы не держать HTTP-запрос."""
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")
    _check_export_payload(payload)
    job = export_jobs.create(
        diagram_id=diagram.id,
        title=diagram.title,
        fmt=fmt,
        xml=payload.xml,
        svg=payload.svg,
        png_base64=payload.png_base64,
        page=payload.page,
        orientation=payload.orientation,
    )
    export_jobs.enqueue(job)
    return job


@router.get("/{diagram_id}/exports/jobs", response_model=list[ExportJobRead])
async def list_export_jobs(
    diagram_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[ExportJob]:
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")
    return export_jobs.list(diagram_id)


@router.get("/{diagram_id}/exports/jobs/{job_id}", response_model=ExportJobRead)
async def get_export_job(
    diagram_id: str,
    job_id: str,
    session: AsyncSession = Depends(get_session),
) -> ExportJob:
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")
    job = export_jobs.get(diagram_id, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="задание не найдено")
    return job


@router.get("/{diagram_id}/exports/jobs/{job_id}/download")
async def download_export_job(
    diagram_id: str,
    job_id: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")
    job = export_jobs.get(diagram_id, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="задание не найдено")
    if job.status != "done" or job.content is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ExportNotReady", "status": job.status, "message": job.error},
        )
    extension = job.extension or "bin"
    fallback = f"{_ascii_filename(job.title) or f'diagram-{diagram.id}'}.{extension}"
    encoded = quote(f"{job.title}.{extension}")
    return Response(
        content=job.content,
        media_type=job.media_type or "application/octet-stream",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"
            ),
            "Cache-Control": "no-store",
        },
    )


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

    _check_export_payload(payload)

    try:
        content, media_type, extension = await run_in_threadpool(
            export_document,
            payload.xml,
            fmt,
            png_base64=payload.png_base64,
            svg=payload.svg,
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
