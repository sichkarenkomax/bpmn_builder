"""Очередь экспортных заданий и краткая история выгрузок.

Очередь живёт в процессе API: она сериализует тяжёлые PDF/XLSX и не
блокирует event loop. История хранится в памяти и ограничена последними
заданиями каждой диаграммы; после перезапуска она очищается.
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from app.export.service import ExportFormat, PdfOrientation, PdfPage, export_document

ExportJobStatus = Literal["queued", "running", "done", "failed"]
MAX_HISTORY_PER_DIAGRAM = 20


@dataclass
class ExportJob:
    id: str
    diagram_id: str
    title: str
    format: ExportFormat
    status: ExportJobStatus = "queued"
    progress: int = 0
    error: str | None = None
    content: bytes | None = None
    media_type: str | None = None
    extension: str | None = None
    filename: str | None = None
    size: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None
    xml: str = ""
    svg: str | None = None
    png_base64: str | None = None
    page: PdfPage = "A4"
    orientation: PdfOrientation = "portrait"


class ExportJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, ExportJob] = {}
        self._queue: asyncio.Queue[str] | None = None
        self._worker: asyncio.Task[None] | None = None

    def create(
        self,
        *,
        diagram_id: str,
        title: str,
        fmt: ExportFormat,
        xml: str,
        svg: str | None,
        png_base64: str | None,
        page: PdfPage,
        orientation: PdfOrientation,
    ) -> ExportJob:
        job = ExportJob(
            id=str(uuid.uuid4()),
            diagram_id=diagram_id,
            title=title,
            format=fmt,
            xml=xml,
            svg=svg,
            png_base64=png_base64,
            page=page,
            orientation=orientation,
        )
        self._jobs[job.id] = job
        self._trim(diagram_id)
        return job

    def list(self, diagram_id: str) -> list[ExportJob]:
        return sorted(
            (job for job in self._jobs.values() if job.diagram_id == diagram_id),
            key=lambda job: job.created_at,
            reverse=True,
        )

    def get(self, diagram_id: str, job_id: str) -> ExportJob | None:
        job = self._jobs.get(job_id)
        return job if job is not None and job.diagram_id == diagram_id else None

    def enqueue(self, job: ExportJob) -> None:
        if self._queue is None:
            self._queue = asyncio.Queue()
        self._queue.put_nowait(job.id)
        # ASGITransport в тестах не запускает lifespan, поэтому воркер
        # поднимается лениво и переиспользуется в пределах event loop.
        if self._worker is None or self._worker.done():
            self._worker = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._worker is not None and not self._worker.done():
            self._worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._worker
        self._worker = None
        self._queue = None

    async def _run(self) -> None:
        assert self._queue is not None
        while True:
            job_id = await self._queue.get()
            try:
                await self._process(job_id)
            finally:
                self._queue.task_done()

    async def _process(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        if job is None or job.status != "queued":
            return
        job.status = "running"
        job.progress = 15
        try:
            content, media_type, extension = await asyncio.to_thread(
                export_document,
                job.xml,
                job.format,
                png_base64=job.png_base64,
                svg=job.svg,
                page=job.page,
                orientation=job.orientation,
            )
        except Exception as exc:  # задание должно завершиться ошибкой, а не уронить воркер
            job.status = "failed"
            job.progress = 100
            job.error = str(exc) or type(exc).__name__
            job.finished_at = datetime.now(UTC)
            return

        job.content = content
        job.media_type = media_type
        job.extension = extension
        job.filename = f"{job.title}.{extension}"
        job.size = len(content)
        job.status = "done"
        job.progress = 100
        job.finished_at = datetime.now(UTC)
        # Тяжёлое тело больше не нужно после успешной выгрузки.
        job.xml = ""
        job.svg = None
        job.png_base64 = None

    def _trim(self, diagram_id: str) -> None:
        jobs = self.list(diagram_id)
        for job in jobs[MAX_HISTORY_PER_DIAGRAM:]:
            if job.status in {"queued", "running"}:
                continue
            self._jobs.pop(job.id, None)


export_jobs = ExportJobStore()

__all__ = ["ExportJob", "ExportJobStatus", "ExportJobStore", "export_jobs"]
