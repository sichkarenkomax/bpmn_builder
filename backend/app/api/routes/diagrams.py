"""Диаграммы: метаданные, BPMN XML, версии."""

from __future__ import annotations

import hashlib

from app.api.deps import get_session
from app.bpmn import (
    BpmnError,
    create_empty_document,
    parse_and_validate_bpmn,
    serialize_bpmn,
)
from app.db.models import Diagram, DiagramVersion
from app.schemas.diagram import (
    BpmnSaved,
    DiagramCreate,
    DiagramList,
    DiagramRead,
    DiagramUpdate,
    VersionRead,
)
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/diagrams", tags=["diagrams"])

MAX_XML_BYTES = 5 * 1024 * 1024


def _etag(xml: str) -> str:
    return hashlib.sha256(xml.encode("utf-8")).hexdigest()[:32]


def _validated(xml: str) -> None:
    """XML должен быть валиден по XSD и разбираться в модель.

    Оба шага используют одно дерево `lxml`: большой документ не разбирается дважды.
    """
    try:
        parse_and_validate_bpmn(xml)
    except BpmnError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": type(exc).__name__, **exc.as_detail()},
        ) from exc


def _check_size(xml: str) -> None:
    if len(xml.encode("utf-8")) > MAX_XML_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="XML больше 5 МиБ"
        )


async def _read_limited_body(request: Request, limit: int) -> bytes:
    """Читает тело порциями и обрывает запрос при превышении лимита.

    `request.body()` сначала буферизует всё тело, поэтому для недоверенного XML
    нельзя проверять размер уже после него: запрос на гигабайты успел бы занять
    память. Content-Length проверяем сразу, а для chunked-запросов считаем
    фактически прочитанные байты.
    """
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > limit:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="XML больше 5 МиБ"
                )
        except ValueError:
            pass

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="XML больше 5 МиБ"
            )
        body.extend(chunk)
    return bytes(body)


def _check_if_match(diagram: Diagram, if_match: str | None) -> None:
    """Сохранение существующей диаграммы требует актуальный ETag.

    Без `If-Match` два редактора молча затирают правки друг друга. 428 говорит
    клиенту, что precondition обязателен, 409 — что версия уже устарела.
    """
    if not if_match or not if_match.strip():
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail={
                "code": "IfMatchRequired",
                "message": "передайте If-Match с текущим ETag диаграммы",
                "etag": diagram.etag,
            },
        )
    if diagram.etag is None or if_match.strip().strip('"') != diagram.etag:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "EtagMismatch",
                "message": "диаграмма изменилась: обновите и повторите сохранение",
                "etag": diagram.etag,
            },
        )


async def _load(session: AsyncSession, diagram_id: str) -> Diagram:
    diagram = await session.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="диаграмма не найдена")
    return diagram


async def _current_xml(session: AsyncSession, diagram: Diagram) -> str:
    if diagram.current_version_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="у диаграммы нет сохранённой версии"
        )
    version = await session.get(DiagramVersion, diagram.current_version_id)
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="текущая версия не найдена"
        )
    return version.xml


@router.post("", response_model=DiagramRead, status_code=status.HTTP_201_CREATED)
async def create_diagram(
    payload: DiagramCreate, session: AsyncSession = Depends(get_session)
) -> Diagram:
    xml = payload.bpmn_xml
    if xml is None:
        xml = serialize_bpmn(create_empty_document(payload.title))
    else:
        _check_size(xml)
        _validated(xml)

    etag = _etag(xml)
    diagram = Diagram(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        etag=etag,
    )
    session.add(diagram)
    await session.flush()

    version = DiagramVersion(diagram_id=diagram.id, xml=xml, message="Создание")
    session.add(version)
    await session.flush()

    diagram.current_version_id = version.id
    await session.commit()
    await session.refresh(diagram)
    return diagram


@router.get("", response_model=DiagramList)
async def list_diagrams(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> DiagramList:
    total = await session.scalar(select(func.count()).select_from(Diagram))
    rows = await session.scalars(
        select(Diagram).order_by(Diagram.updated_at.desc()).limit(limit).offset(offset)
    )
    return DiagramList(
        items=[DiagramRead.model_validate(row) for row in rows],
        total=total or 0,
    )


@router.get("/{diagram_id}", response_model=DiagramRead)
async def get_diagram(diagram_id: str, session: AsyncSession = Depends(get_session)) -> Diagram:
    return await _load(session, diagram_id)


@router.patch("/{diagram_id}", response_model=DiagramRead)
async def update_diagram(
    diagram_id: str,
    payload: DiagramUpdate,
    session: AsyncSession = Depends(get_session),
) -> Diagram:
    diagram = await _load(session, diagram_id)
    if payload.title is not None:
        diagram.title = payload.title
    if "description" in payload.model_fields_set:
        diagram.description = payload.description or None
    if payload.status is not None:
        diagram.status = payload.status
    await session.commit()
    await session.refresh(diagram)
    return diagram


@router.delete("/{diagram_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diagram(diagram_id: str, session: AsyncSession = Depends(get_session)) -> Response:
    diagram = await _load(session, diagram_id)
    await session.delete(diagram)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{diagram_id}/bpmn", responses={200: {"content": {"application/xml": {}}}})
async def get_bpmn(diagram_id: str, session: AsyncSession = Depends(get_session)) -> Response:
    diagram = await _load(session, diagram_id)
    xml = await _current_xml(session, diagram)
    headers = {"ETag": f'"{diagram.etag}"'} if diagram.etag else {}
    return Response(content=xml, media_type="application/xml", headers=headers)


@router.put("/{diagram_id}/bpmn", response_model=BpmnSaved)
async def put_bpmn(
    diagram_id: str,
    request: Request,
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
) -> BpmnSaved:
    diagram = await _load(session, diagram_id)
    _check_if_match(diagram, if_match)
    body = await _read_limited_body(request, MAX_XML_BYTES)

    try:
        xml = body.decode("utf-8")
    except UnicodeDecodeError as exc:
        detail = {
            "code": "BpmnSyntaxError",
            "message": "XML должен быть в UTF-8",
            "line": None,
            "column": None,
        }
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc
    _validated(xml)
    etag = _etag(xml)

    if diagram.etag and etag == diagram.etag:
        return BpmnSaved(etag=diagram.etag, version_id=diagram.current_version_id or "")

    version = DiagramVersion(diagram_id=diagram.id, xml=xml, message=None)
    session.add(version)
    await session.flush()

    diagram.current_version_id = version.id
    diagram.etag = etag
    await session.commit()
    return BpmnSaved(etag=diagram.etag, version_id=version.id)


@router.get("/{diagram_id}/versions", response_model=list[VersionRead])
async def list_versions(
    diagram_id: str,
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[DiagramVersion]:
    await _load(session, diagram_id)
    rows = await session.scalars(
        select(DiagramVersion)
        .where(DiagramVersion.diagram_id == diagram_id)
        .order_by(DiagramVersion.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows)


__all__ = ["router", "MAX_XML_BYTES"]
