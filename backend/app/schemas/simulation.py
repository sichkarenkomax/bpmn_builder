"""Контракт симуляции токена (этап 3, первый срез `v0.3`)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.bpmn.model import NodeType

SIMULATION_SCHEMA_VERSION = "1.0"

type VariableValue = bool | int | float | str

SimulationStepAction = Literal["completed", "waiting"]

SimulationDecisionReason = Literal["no_conditions", "variables_missing", "no_match"]


class SimulationRequest(BaseModel):
    """Переменные процесса, ручной выбор ветвей и предел шагов."""

    model_config = ConfigDict(extra="forbid")

    variables: dict[str, VariableValue] = Field(default_factory=dict)
    #: id шлюза → id исходящего потока: выбор пользователя там, где условие
    #: не задано или его нельзя вычислить.
    choices: dict[str, str] = Field(default_factory=dict)
    max_steps: int = Field(default=500, ge=1, le=5000)


class SimulationStep(BaseModel):
    """Один шаг токена: элемент, действие и входящий поток."""

    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=1)
    token: int = Field(ge=1)
    node_id: str = Field(min_length=1, max_length=255)
    node_name: str | None = None
    node_type: NodeType
    action: SimulationStepAction
    flow_id: str | None = None
    message: str | None = None
    #: Сколько симуляция ждёт на таймере (`timeDuration`), мс.
    wait_ms: int | None = Field(default=None, ge=0)


class SimulationBranch(BaseModel):
    """Вариант ветки, который предлагается выбрать вручную."""

    model_config = ConfigDict(extra="forbid")

    flow_id: str = Field(min_length=1, max_length=255)
    flow_name: str | None = None
    target_id: str = Field(min_length=1, max_length=255)
    target_name: str | None = None
    condition: str | None = None


class SimulationDecision(BaseModel):
    """Прогон остановлен на шлюзе: ветку выбирает пользователь."""

    model_config = ConfigDict(extra="forbid")

    node_id: str = Field(min_length=1, max_length=255)
    node_name: str | None = None
    node_type: NodeType
    #: `no_conditions` — условия не заданы, `variables_missing` — переменных нет,
    #: `no_match` — ни одно условие не истинно.
    reason: SimulationDecisionReason
    branches: list[SimulationBranch] = Field(min_length=1)


class SimulationReport(BaseModel):
    """Результат прогона; ошибки структуры приходят как 400, а не как отчёт."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default=SIMULATION_SCHEMA_VERSION, min_length=1, max_length=20)
    completed: bool
    steps: list[SimulationStep]
    #: Сколько раз токен входил в элемент — основа heatmap узких мест.
    counts: dict[str, int] = Field(default_factory=dict)
    tokens_started: int = Field(ge=0)
    tokens_completed: int = Field(ge=0)
    max_steps: int = Field(ge=1)
    #: Если задано, прогон ждёт ручного выбора ветки и продолжается с `choices`.
    decision: SimulationDecision | None = None


__all__ = [
    "SIMULATION_SCHEMA_VERSION",
    "SimulationBranch",
    "SimulationDecision",
    "SimulationDecisionReason",
    "SimulationReport",
    "SimulationRequest",
    "SimulationStep",
    "SimulationStepAction",
    "VariableValue",
]
