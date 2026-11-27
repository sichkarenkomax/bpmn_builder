"""Симуляция токена: прогон сохранённой схемы (этап 3)."""

from __future__ import annotations

from typing import Any

from app.api.deps import get_session
from app.api.routes.diagrams import MAX_XML_BYTES, _current_xml, _load
from app.bpmn import BpmnError, parse_and_validate_bpmn
from app.db.models import Diagram, SimulationRun, TestCase
from app.schemas.simulation import (
    SimulationReport,
    SimulationRequest,
    SimulationRunCreate,
    SimulationRunRead,
    StepDiff,
    TestCaseCreate,
    TestCaseRead,
    TestCaseResult,
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


async def _simulate_diagram(
    session: AsyncSession, diagram_id: str, payload: SimulationRequest
) -> tuple[Diagram, SimulationReport]:
    """Проводит токен по текущей версии XML и возвращает диаграмму и отчёт."""
    diagram = await _load(session, diagram_id)
    xml = await _current_xml(session, diagram)
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
    diagram_id: str,
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=SIMULATION_RUN_LIMIT, ge=1, le=100),
) -> list[SimulationRun]:
    await _load(session, diagram_id)
    rows = await session.scalars(
        select(SimulationRun)
        .where(SimulationRun.diagram_id == diagram_id)
        .order_by(SimulationRun.created_at.desc(), SimulationRun.id.desc())
        .limit(limit)
    )
    return list(rows)


@router.delete("/{diagram_id}/simulation-runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_simulation_run(
    diagram_id: str, run_id: str, session: AsyncSession = Depends(get_session)
) -> Response:
    run = await _load_run(session, diagram_id, run_id)
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
    diagram_id: str,
    payload: TestCaseCreate,
    session: AsyncSession = Depends(get_session),
) -> TestCase:
    await _load(session, diagram_id)
    case = TestCase(
        diagram_id=diagram_id,
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
    diagram_id: str, session: AsyncSession = Depends(get_session)
) -> list[TestCase]:
    await _load(session, diagram_id)
    rows = await session.scalars(
        select(TestCase)
        .where(TestCase.diagram_id == diagram_id)
        .order_by(TestCase.created_at, TestCase.name)
    )
    return list(rows)


@router.delete("/{diagram_id}/test-cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_case(
    diagram_id: str, case_id: str, session: AsyncSession = Depends(get_session)
) -> Response:
    case = await _load_case(session, diagram_id, case_id)
    await session.delete(case)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{diagram_id}/test-cases/{case_id}/run", response_model=TestCaseResult)
async def run_test_case(
    diagram_id: str, case_id: str, session: AsyncSession = Depends(get_session)
) -> TestCaseResult:
    """Прогоняет тест-кейс по текущему XML и сравнивает шаги и переменные."""
    case = await _load_case(session, diagram_id, case_id)
    _, report = await _simulate_diagram(
        session,
        diagram_id,
        SimulationRequest(variables=case.variables, choices=case.choices),
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
