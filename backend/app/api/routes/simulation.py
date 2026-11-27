"""Симуляция токена: прогон сохранённой схемы (этап 3)."""

from __future__ import annotations

from typing import Any, cast

from app.api.access import DiagramAccess, require_diagram
from app.api.deps import get_session
from app.api.routes.diagrams import MAX_XML_BYTES, _current_xml, _load
from app.bpmn import BpmnError, parse_and_validate_bpmn
from app.db.models import Diagram, DiagramVersion, SimulationRun, TestCase
from app.schemas.simulation import (
    SimulationReport,
    SimulationRequest,
    SimulationRunCreate,
    SimulationRunRead,
    StepDiff,
    TestCaseCreate,
    TestCaseRead,
    TestCaseResult,
    TestCaseUpdate,
    VariableDiff,
)
from app.simulation.engine import SimulationError, simulate
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/diagrams", tags=["simulation"])

#: Сколько последних прогонов хранить на диаграмму.
SIMULATION_RUN_LIMIT = 20

_SIMULATE_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "Журнал прогона: шаги, счётчики прохождений, завершённость",
        "content": {
            "application/json": {
                "example": {
                    "schema_version": "1.0",
                    "completed": True,
                    "steps": [
                        {
                            "index": 1,
                            "token": 1,
                            "node_id": "StartEvent_1",
                            "node_name": "Заявка получена",
                            "node_type": "startEvent",
                            "action": "completed",
                            "flow_id": None,
                            "message": None,
                        }
                    ],
                    "counts": {"StartEvent_1": 1, "EndEvent_1": 1},
                    "tokens_started": 1,
                    "tokens_completed": 1,
                    "max_steps": 500,
                }
            }
        },
    },
    400: {
        "description": (
            "XML не разбирается или схема невыполнима (нет старта, тупик, "
            "ошибка в условии, неверный ручной выбор ветки)"
        )
    },
    404: {"description": "Диаграмма не найдена"},
    409: {"description": "У диаграммы нет сохранённой версии"},
    413: {"description": "Сохранённый XML больше 5 МиБ"},
    429: {"description": "Превышен лимит запросов"},
    504: {"description": "Симуляция не уложилась в таймаут"},
}


async def _version_xml(session: AsyncSession, diagram: Diagram, version_id: str) -> str:
    version = await session.get(DiagramVersion, version_id)
    if version is None or version.diagram_id != diagram.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="версия XML тест-кейса не найдена",
        )
    return version.xml


async def _simulate_diagram(
    session: AsyncSession,
    diagram_id: str,
    payload: SimulationRequest,
    *,
    version_id: str | None = None,
) -> tuple[Diagram, SimulationReport]:
    """Проводит токен по XML и возвращает диаграмму и отчёт.

    `version_id` фиксирует конкретную версию (тест-кейс); без него берётся
    текущая версия диаграммы.
    """
    diagram = await _load(session, diagram_id)
    xml = (
        await _current_xml(session, diagram)
        if version_id is None
        else await _version_xml(session, diagram, version_id)
    )
    if len(xml.encode("utf-8")) > MAX_XML_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="XML больше 5 МиБ"
        )
    try:
        document, _ = parse_and_validate_bpmn(xml)
    except BpmnError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": type(exc).__name__, **exc.as_detail()},
        ) from exc
    try:
        report = simulate(
            document,
            variables=payload.variables,
            choices=payload.choices,
            max_steps=payload.max_steps,
        )
    except SimulationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SimulationError", "message": str(exc)},
        ) from exc
    return diagram, report


@router.post(
    "/{diagram_id}/simulate",
    response_model=SimulationReport,
    responses=_SIMULATE_RESPONSES,
)
async def simulate_diagram(
    diagram_id: str,
    payload: SimulationRequest,
    _access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> SimulationReport:
    """Проводит токен по сохранённому XML, ничего не записывая в диаграмму."""
    _, report = await _simulate_diagram(session, diagram_id, payload)
    return report


# --- сохранённые прогоны ---------------------------------------------------


async def _load_run(session: AsyncSession, diagram_id: str, run_id: str) -> SimulationRun:
    run = await session.get(SimulationRun, run_id)
    if run is None or run.diagram_id != diagram_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="прогон не найден")
    return run


@router.post(
    "/{diagram_id}/simulation-runs",
    response_model=SimulationRunRead,
    status_code=status.HTTP_201_CREATED,
    responses=_SIMULATE_RESPONSES,
)
async def save_simulation_run(
    diagram_id: str,
    payload: SimulationRunCreate,
    _access: DiagramAccess = Depends(require_diagram("editor")),
    session: AsyncSession = Depends(get_session),
) -> SimulationRun:
    """Выполняет прогон по текущему XML и сохраняет его вместе с отчётом."""
    diagram, report = await _simulate_diagram(session, diagram_id, payload)
    run = SimulationRun(
        diagram_id=diagram.id,
        version_id=diagram.current_version_id,
        variables=payload.variables,
        choices=payload.choices,
        report=report.model_dump(mode="json"),
    )
    session.add(run)
    await session.flush()

    stale = await session.scalars(
        select(SimulationRun)
        .where(SimulationRun.diagram_id == diagram.id)
        .order_by(SimulationRun.created_at.desc(), SimulationRun.id.desc())
        .offset(SIMULATION_RUN_LIMIT)
    )
    for old in stale.all():
        await session.delete(old)
    await session.commit()
    await session.refresh(run)
    return run


@router.get("/{diagram_id}/simulation-runs", response_model=list[SimulationRunRead])
async def list_simulation_runs(
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=SIMULATION_RUN_LIMIT, ge=1, le=100),
) -> list[SimulationRun]:
    diagram_id = access.diagram.id
    rows = await session.scalars(
        select(SimulationRun)
        .where(SimulationRun.diagram_id == diagram_id)
        .order_by(SimulationRun.created_at.desc(), SimulationRun.id.desc())
        .limit(limit)
    )
    return list(rows)


@router.delete("/{diagram_id}/simulation-runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_simulation_run(
    run_id: str,
    access: DiagramAccess = Depends(require_diagram("editor")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    run = await _load_run(session, access.diagram.id, run_id)
    await session.delete(run)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- тест-кейсы ------------------------------------------------------------


async def _load_case(session: AsyncSession, diagram_id: str, case_id: str) -> TestCase:
    case = await session.get(TestCase, case_id)
    if case is None or case.diagram_id != diagram_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="тест-кейс не найден")
    return case


@router.post(
    "/{diagram_id}/test-cases",
    response_model=TestCaseRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_test_case(
    payload: TestCaseCreate,
    access: DiagramAccess = Depends(require_diagram("editor")),
    session: AsyncSession = Depends(get_session),
) -> TestCase:
    diagram = access.diagram
    case = TestCase(
        diagram_id=diagram.id,
        version_id=diagram.current_version_id,
        name=payload.name,
        variables=payload.variables,
        choices=payload.choices,
        expected_steps=payload.expected_steps,
        expected_variables=payload.expected_variables,
    )
    session.add(case)
    await session.commit()
    await session.refresh(case)
    return case


@router.get("/{diagram_id}/test-cases", response_model=list[TestCaseRead])
async def list_test_cases(
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> list[TestCase]:
    rows = await session.scalars(
        select(TestCase)
        .where(TestCase.diagram_id == access.diagram.id)
        .order_by(TestCase.created_at, TestCase.name)
    )
    return list(rows)


@router.patch("/{diagram_id}/test-cases/{case_id}", response_model=TestCaseRead)
async def update_test_case(
    case_id: str,
    payload: TestCaseUpdate,
    access: DiagramAccess = Depends(require_diagram("editor")),
    session: AsyncSession = Depends(get_session),
) -> TestCase:
    case = await _load_case(session, access.diagram.id, case_id)
    diagram = access.diagram
    fields = payload.model_fields_set
    if payload.name is not None:
        case.name = payload.name
    if payload.variables is not None:
        case.variables = cast(dict[str, object], payload.variables)
    if payload.choices is not None:
        case.choices = payload.choices
    if payload.expected_steps is not None:
        case.expected_steps = payload.expected_steps
    if payload.expected_variables is not None:
        case.expected_variables = cast(dict[str, object], payload.expected_variables)
    if "version_id" in fields:
        if payload.version_id is None:
            case.version_id = diagram.current_version_id
        else:
            await _version_xml(session, diagram, payload.version_id)
            case.version_id = payload.version_id
    await session.commit()
    await session.refresh(case)
    return case


@router.delete("/{diagram_id}/test-cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_case(
    case_id: str,
    access: DiagramAccess = Depends(require_diagram("editor")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    case = await _load_case(session, access.diagram.id, case_id)
    await session.delete(case)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{diagram_id}/test-cases/{case_id}/run", response_model=TestCaseResult)
async def run_test_case(
    case_id: str,
    access: DiagramAccess = Depends(require_diagram("viewer")),
    session: AsyncSession = Depends(get_session),
) -> TestCaseResult:
    """Прогоняет тест-кейс по текущему XML и сравнивает шаги и переменные."""
    case = await _load_case(session, access.diagram.id, case_id)
    _, report = await _simulate_diagram(
        session,
        access.diagram.id,
        SimulationRequest(variables=case.variables, choices=case.choices),
        version_id=case.version_id,
    )

    actual_steps = [step.node_id for step in report.steps]
    step_diffs: list[StepDiff] = []
    for index in range(max(len(case.expected_steps), len(actual_steps))):
        expected = case.expected_steps[index] if index < len(case.expected_steps) else None
        actual = actual_steps[index] if index < len(actual_steps) else None
        if expected != actual:
            step_diffs.append(StepDiff(index=index, expected=expected, actual=actual))

    final_variables = report.steps[-1].variables if report.steps else {}
    variable_diffs = [
        VariableDiff(
            name=name,
            expected=expected,
            actual=final_variables.get(name),
        )
        for name, expected in case.expected_variables.items()
        if final_variables.get(name) != expected
    ]

    return TestCaseResult(
        passed=report.completed and not step_diffs and not variable_diffs,
        report=report,
        step_diffs=step_diffs,
        variable_diffs=variable_diffs,
    )


__all__ = ["router"]
