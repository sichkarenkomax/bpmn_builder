"""Диаграммы: метаданные, BPMN XML, версии."""

from __future__ import annotations

import hashlib
from typing import Any, cast
from urllib.parse import quote

from app.api.access import DiagramAccess, require_diagram
from app.api.deps import get_current_user, get_session
from app.bpmn import (
    BpmnDocument,
    BpmnError,
    create_empty_document,
    parse_and_validate_bpmn,
    serialize_bpmn,
)
from app.core.config import get_settings
from app.core.events import DIAGRAM_SAVED
from app.core.events import publish as publish_event
from app.db.models import Diagram, DiagramAcl, DiagramVersion, User
from app.schemas.diagram import (
    BpmnSaved,
    DiagramCreate,
    DiagramList,
    DiagramRead,
    DiagramUpdate,
    VersionRead,
)
from app.schemas.validation import Finding, ValidationReport
from app.validation import (
    RuleCategory,
    ValidationEngine,
    build_engine,
    load_rule_config,
)
from app.validation.report import build_validation_docx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/diagrams", tags=["diagrams"])

MAX_XML_BYTES = 5 * 1024 * 1024


def _etag(xml: str) -> str:
    return hashlib.sha256(xml.encode("utf-8")).hexdigest()[:32]


_RULE_CATEGORIES = {"structure", "gateway", "event", "lane"}
_REPORT_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _validated(xml: str) -> BpmnDocument:
    """XML должен быть валиден по XSD и разбираться в модель.

    Оба шага используют одно дерево `lxml`: большой документ не разбирается дважды.
    Модель возвращается, чтобы сохранение не разбирало XML ещё раз для валидации.
    """
    try:
        document, _ = parse_and_validate_bpmn(xml)
        return document
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
    payload: DiagramCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
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
        owner_id=user.id,
        etag=etag,
    )
    session.add(diagram)
    await session.flush()
    session.add(DiagramAcl(diagram_id=diagram.id, user_id=user.id, role="owner"))

    version = DiagramVersion(diagram_id=diagram.id, xml=xml, message="Создание", author_id=user.id)
    session.add(version)
    await session.flush()

    diagram.current_version_id = version.id
    await session.commit()
    await session.refresh(diagram)
    await publish_event(
        DIAGRAM_SAVED,
        {"diagram_id": diagram.id, "version_id": version.id, "etag": diagram.etag},
    )
    return diagram


@router.get("", response_model=DiagramList)
async def list_diagrams(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> DiagramList:
    accessible = or_(
        Diagram.owner_id == user.id,
        Diagram.id.in_(select(DiagramAcl.diagram_id).where(DiagramAcl.user_id == user.id)),
    )
    total = await session.scalar(select(func.count()).select_from(Diagram).where(accessible))
    rows = await session.scalars(
        select(Diagram)
        .where(accessible)
        .order_by(Diagram.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return DiagramList(
        items=[DiagramRead.model_validate(row) for row in rows],
        total=total or 0,
    )


@router.get("/{diagram_id}", response_model=DiagramRead)
async def get_diagram(
    access: DiagramAccess = Depends(require_diagram("viewer")),
) -> Diagram:
    return access.diagram


@router.patch("/{diagram_id}", response_model=DiagramRead)
async def update_diagram(
    payload: DiagramUpdate,
    access: DiagramAccess = Depends(require_diagram("editor")),
    session: AsyncSession = Depends(get_session),
) -> Diagram:
    diagram = access.diagram
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
async def delete_diagram(
    access: DiagramAccess = Depends(require_diagram("owner")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await session.delete(access.diagram)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{diagram_id}/bpmn", responses={200: {"content": {"application/xml": {}}}})
async def get_bpmn(
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    diagram = access.diagram
    xml = await _current_xml(session, diagram)
    headers = {"ETag": f'"{diagram.etag}"'} if diagram.etag else {}
    return Response(content=xml, media_type="application/xml", headers=headers)


@router.put("/{diagram_id}/bpmn", response_model=BpmnSaved)
async def put_bpmn(
    request: Request,
    response: Response,
    access: DiagramAccess = Depends(require_diagram("editor")),
    if_match: str | None = Header(default=None, alias="If-Match"),
    session: AsyncSession = Depends(get_session),
) -> BpmnSaved:
    diagram = access.diagram
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
    document = _validated(xml)
    etag = _etag(xml)

    # 2.2.3: предупреждаем о проблемах заголовками, но не блокируем сохранение.
    report = _report(document)
    response.headers["X-Validation-Errors"] = str(report.summary.errors)
    response.headers["X-Validation-Warnings"] = str(report.summary.warnings)

    if diagram.etag and etag == diagram.etag:
        return BpmnSaved(etag=diagram.etag, version_id=diagram.current_version_id or "")

    version = DiagramVersion(diagram_id=diagram.id, xml=xml, message=None, author_id=access.user.id)
    session.add(version)
    await session.flush()

    diagram.current_version_id = version.id
    diagram.etag = etag
    await session.commit()
    await publish_event(
        DIAGRAM_SAVED,
        {"diagram_id": diagram.id, "version_id": version.id, "etag": etag},
    )
    return BpmnSaved(etag=diagram.etag, version_id=version.id)


def _categories(include: str | None) -> frozenset[RuleCategory] | None:
    """`?include=xsd,structure,gateway` — пустое значение проверяет всё."""
    if include is None or not include.strip():
        return None
    parts = {part.strip().lower() for part in include.split(",") if part.strip()}
    unknown = parts - _RULE_CATEGORIES - {"xsd"}
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "UnknownValidationCategory",
                "message": "неизвестная категория: " + ", ".join(sorted(unknown)),
                "allowed": sorted(_RULE_CATEGORIES | {"xsd"}),
            },
        )
    categories = frozenset(cast(RuleCategory, part) for part in parts & _RULE_CATEGORIES)
    return categories


def _parse_engine(include: str | None) -> tuple[ValidationEngine, list[str]]:
    config = load_rule_config(get_settings().validation_rules_file)
    return build_engine(config, categories=_categories(include)), list(config.errors)


def _with_config(report: ValidationReport, config_errors: list[str]) -> ValidationReport:
    if not config_errors:
        return report
    return report.model_copy(update={"config_errors": config_errors})


def _report(document: BpmnDocument, include: str | None = None) -> ValidationReport:
    engine, config_errors = _parse_engine(include)
    return _with_config(engine.validate(document), config_errors)


def _xsd_report(exc: BpmnError, config_errors: list[str]) -> ValidationReport:
    """Битый сохранённый XML — это отчёт, а не 500: CI должен получить JSON."""
    finding = Finding(
        rule_id="BPMN-XSD-001",
        severity="error",
        message=exc.message,
        # lxml отдаёт 0 для неизвестной позиции, а контракт — 1-based или null.
        line=exc.line if exc.line and exc.line >= 1 else None,
        column=exc.column if exc.column and exc.column >= 1 else None,
        hint="исправьте XML и сохраните диаграмму заново",
    )
    return ValidationReport.from_findings([finding], duration_ms=0.0, config_errors=config_errors)


async def _validate_saved(
    session: AsyncSession, diagram: Diagram, include: str | None
) -> ValidationReport:
    xml = await _current_xml(session, diagram)
    _check_size(xml)
    engine, config_errors = _parse_engine(include)
    try:
        document, _ = parse_and_validate_bpmn(xml)
    except BpmnError as exc:
        return _xsd_report(exc, config_errors)
    return _with_config(engine.validate(document), config_errors)


_VALIDATE_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "Отчёт валидации; 200 возвращается и для схемы с ошибками (valid=false)",
        "content": {
            "application/json": {
                "example": {
                    "valid": False,
                    "summary": {"errors": 1, "warnings": 0, "infos": 0},
                    "findings": [
                        {
                            "rule_id": "BPMN-GATEWAY-001",
                            "severity": "error",
                            "message": "ветка «Разветвление» без условия",
                            "element_id": "Flow_1",
                            "element_name": None,
                            "line": None,
                            "column": None,
                            "hint": "добавьте conditionExpression",
                        }
                    ],
                    "duration_ms": 3.2,
                    "schema_version": "1.0",
                    "config_errors": [],
                }
            }
        },
    },
    400: {"description": "Неизвестная категория в include"},
    404: {"description": "Диаграмма не найдена"},
    413: {"description": "Сохранённый XML больше 5 МиБ"},
    429: {"description": "Превышен лимит запросов"},
    504: {"description": "Проверка не уложилась в таймаут"},
}


@router.post(
    "/{diagram_id}/validate",
    response_model=ValidationReport,
    responses=_VALIDATE_RESPONSES,
)
async def validate_diagram_post(
    include: str | None = Query(
        default=None,
        description="Категории правил: xsd,structure,gateway,event,lane",
        examples=["structure,gateway"],
    ),
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> ValidationReport:
    """Проверяет сохранённый XML; не создаёт версию и не меняет диаграмму (2.2.1)."""
    return await _validate_saved(session, access.diagram, include)


@router.get(
    "/{diagram_id}/validation",
    response_model=ValidationReport,
    responses=_VALIDATE_RESPONSES,
    deprecated=True,
)
async def validate_diagram(
    include: str | None = Query(default=None),
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> ValidationReport:
    """Совместимый GET для UI; контракт для CI — `POST /validate`."""
    return await _validate_saved(session, access.diagram, include)


@router.get("/{diagram_id}/validation/report.docx")
async def validation_report_docx(
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """DOCX-отчёт по сохранённой версии (2.4.2)."""
    diagram = access.diagram
    report = await _validate_saved(session, diagram, None)
    payload = await run_in_threadpool(
        build_validation_docx,
        report,
        diagram_title=diagram.title,
        diagram_id=diagram.id,
    )
    filename = quote(f"validation-{diagram.id}.docx")
    return Response(
        content=payload,
        media_type=_REPORT_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("/{diagram_id}/versions", response_model=list[VersionRead])
async def list_versions(
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[DiagramVersion]:
    diagram_id = access.diagram.id
    rows = await session.scalars(
        select(DiagramVersion)
        .where(DiagramVersion.diagram_id == diagram_id)
        .order_by(DiagramVersion.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows)


__all__ = ["router", "MAX_XML_BYTES"]
