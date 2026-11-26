"""Симуляция токена: прогон сохранённой схемы (этап 3)."""

from __future__ import annotations

from typing import Any

from app.api.deps import get_session
from app.api.routes.diagrams import MAX_XML_BYTES, _current_xml, _load
from app.bpmn import BpmnError, parse_and_validate_bpmn
from app.schemas.simulation import SimulationReport, SimulationRequest
from app.simulation.engine import SimulationError, simulate
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/diagrams", tags=["simulation"])

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
        return simulate(
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


__all__ = ["router"]
