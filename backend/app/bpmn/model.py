"""Объектная модель подмножества BPMN 2.0.

Модель — это *чтение* диаграммы: она не хранит чужие расширения и не является
источником истины (см. ADR-003). Источник истины — XML, который лежит рядом
в виде `source_xml`.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, field_validator, model_validator


def _empty_to_none(value: str | None) -> str | None:
    """Пустая строка и отсутствие значения для BPMN — одно и то же."""
    return value or None


class NodeType(StrEnum):
    """Типы узлов, которые поддерживаются в v0.1."""

    START_EVENT = "startEvent"
    END_EVENT = "endEvent"
    INTERMEDIATE_CATCH_EVENT = "intermediateCatchEvent"
    INTERMEDIATE_THROW_EVENT = "intermediateThrowEvent"
    BOUNDARY_EVENT = "boundaryEvent"
    TASK = "task"
    USER_TASK = "userTask"
    SERVICE_TASK = "serviceTask"
    SCRIPT_TASK = "scriptTask"
    MANUAL_TASK = "manualTask"
    EXCLUSIVE_GATEWAY = "exclusiveGateway"
    PARALLEL_GATEWAY = "parallelGateway"
    INCLUSIVE_GATEWAY = "inclusiveGateway"
    EVENT_BASED_GATEWAY = "eventBasedGateway"
    SUB_PROCESS = "subProcess"


class TimerKind(StrEnum):
    """Вид определения таймера по BPMN."""

    DURATION = "timeDuration"
    DATE = "timeDate"
    CYCLE = "timeCycle"


class TimerDefinition(BaseModel):
    """Определение таймера события: длительность, дата или цикл."""

    model_config = ConfigDict(str_strip_whitespace=True, frozen=True)

    kind: TimerKind
    expression: str = Field(min_length=1, max_length=255)


class FlowType(StrEnum):
    SEQUENCE = "sequenceFlow"
    MESSAGE = "messageFlow"
    ASSOCIATION = "association"


class ArtifactType(StrEnum):
    TEXT_ANNOTATION = "textAnnotation"
    GROUP = "group"
    DATA_OBJECT = "dataObject"


class Bounds(BaseModel):
    """Геометрия фигуры (BPMNDI)."""

    model_config = ConfigDict(frozen=True)

    x: float
    y: float
    width: float
    height: float


class Waypoint(BaseModel):
    """Точка излома связи."""

    model_config = ConfigDict(frozen=True)

    x: float
    y: float


class DiagramElement(BaseModel):
    """Общая часть: id, имя, документация."""

    model_config = ConfigDict(str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=255)
    name: str | None = None
    documentation: str | None = None
    bounds: Bounds | None = None

    @field_validator("documentation")
    @classmethod
    def _documentation_optional(cls, value: str | None) -> str | None:
        return _empty_to_none(value)


class Node(DiagramElement):
    """Задача, событие, шлюз или подпроцесс."""

    type: NodeType
    attached_to: str | None = None
    cancel_activity: bool | None = None
    is_expanded: bool | None = None
    #: QName по спецификации (tImplementation)
    implementation: str | None = Field(
        default=None, pattern=r"^[A-Za-z_][\w.\-]*(:[A-Za-z_][\w.\-]*)?$"
    )
    script_format: str | None = None
    script: str | None = None
    #: id исходящего потока по умолчанию (`default` у шлюза или активности).
    default_flow: str | None = None
    #: Таймер стартового, промежуточного ловящего или граничного события.
    timer: TimerDefinition | None = None

    @field_validator("script")
    @classmethod
    def _script_optional(cls, value: str | None) -> str | None:
        return _empty_to_none(value)

    @model_validator(mode="after")
    def _check_type_specifics(self) -> Node:
        if self.type is NodeType.BOUNDARY_EVENT and not self.attached_to:
            msg = "граничному событию нужен attachedToRef"
            raise ValueError(msg)
        if self.type is not NodeType.BOUNDARY_EVENT and self.attached_to:
            msg = "attachedToRef допустим только для граничного события"
            raise ValueError(msg)
        if self.implementation and self.type is not NodeType.SERVICE_TASK:
            msg = "implementation допустим только для сервисной задачи"
            raise ValueError(msg)
        if (self.script or self.script_format) and self.type is not NodeType.SCRIPT_TASK:
            msg = "script допустим только для скрипт-задачи"
            raise ValueError(msg)
        if self.is_expanded is not None and self.type is not NodeType.SUB_PROCESS:
            msg = "isExpanded допустим только для подпроцесса"
            raise ValueError(msg)
        if self.cancel_activity is not None and self.type is not NodeType.BOUNDARY_EVENT:
            msg = "cancelActivity допустим только для граничного события"
            raise ValueError(msg)
        timer_events = {
            NodeType.START_EVENT,
            NodeType.INTERMEDIATE_CATCH_EVENT,
            NodeType.BOUNDARY_EVENT,
        }
        if self.timer is not None and self.type not in timer_events:
            msg = "таймер допустим только для стартового, промежуточного или граничного события"
            raise ValueError(msg)
        return self


class Flow(DiagramElement):
    """Поток последовательности, сообщения или ассоциация."""

    type: FlowType
    source_ref: str
    target_ref: str
    condition: str | None = None
    waypoints: list[Waypoint] = Field(default_factory=list)

    @field_validator("condition")
    @classmethod
    def _condition_optional(cls, value: str | None) -> str | None:
        return _empty_to_none(value)

    @model_validator(mode="after")
    def _check_condition(self) -> Flow:
        if self.condition and self.type is not FlowType.SEQUENCE:
            msg = "условие допустимо только для потока последовательности"
            raise ValueError(msg)
        if self.name and self.type is FlowType.ASSOCIATION:
            msg = "у ассоциации нет имени по спецификации BPMN"
            raise ValueError(msg)
        return self


class Lane(DiagramElement):
    """Дорожка внутри пула."""

    flow_node_refs: list[str] = Field(default_factory=list)
    child_lanes: list[Lane] = Field(default_factory=list)


class Participant(DiagramElement):
    """Пул: участник коллаборации со ссылкой на процесс."""

    process_ref: str | None = None


class Artifact(DiagramElement):
    """Аннотация, группа или объект данных."""

    type: ArtifactType
    text: str | None = None
    #: QName по спецификации: либо NCName, либо префикс:NCName
    category_value_ref: str | None = Field(
        default=None, pattern=r"^[A-Za-z_][\w.\-]*(:[A-Za-z_][\w.\-]*)?$"
    )

    @field_validator("text")
    @classmethod
    def _text_optional(cls, value: str | None) -> str | None:
        return _empty_to_none(value)

    @model_validator(mode="after")
    def _check_name(self) -> Artifact:
        # В BPMN имя есть только у объекта данных; аннотация и группа безымянны.
        if self.name and self.type is not ArtifactType.DATA_OBJECT:
            msg = f"у {self.type.value} нет имени по спецификации BPMN"
            raise ValueError(msg)
        return self


class Process(DiagramElement):
    """Процесс со своим набором элементов."""

    is_executable: bool = False
    nodes: list[Node] = Field(default_factory=list)
    flows: list[Flow] = Field(default_factory=list)
    associations: list[Flow] = Field(default_factory=list)
    lanes: list[Lane] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    plane_id: str | None = None
    diagram_id: str | None = None

    def node_ids(self) -> set[str]:
        return {node.id for node in self.nodes}


class Collaboration(BaseModel):
    """Коллаборация: пулы и потоки сообщений между ними."""

    id: str = Field(min_length=1, max_length=255)
    participants: list[Participant] = Field(default_factory=list)
    message_flows: list[Flow] = Field(default_factory=list)
    plane_id: str | None = None
    diagram_id: str | None = None


class BpmnDocument(BaseModel):
    """Корень: `bpmn:definitions` + то, что нам нужно для работы."""

    model_config = ConfigDict(str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=255)
    target_namespace: str = "http://bpmn-studio.dev/schema"
    exporter: str | None = None
    processes: list[Process] = Field(default_factory=list)
    collaboration: Collaboration | None = None

    _source_xml: str | None = PrivateAttr(default=None)

    @property
    def source_xml(self) -> str | None:
        """Исходный XML, если документ получен парсингом."""
        return self._source_xml

    def keep_source(self, xml: str) -> BpmnDocument:
        self._source_xml = xml
        return self

    def __eq__(self, other: object) -> bool:
        """Сравниваем только модель: исходный XML — не часть данных документа.

        Иначе два одинаковых разбора одного файла считались бы разными из-за
        кеша исходника, а тесты round-trip теряют смысл.
        """
        if not isinstance(other, BpmnDocument):
            return NotImplemented
        return self.model_dump() == other.model_dump()

    def detached(self) -> BpmnDocument:
        """Копия без исходного XML: сериализатор построит документ заново."""
        return BpmnDocument.model_validate(self.model_dump())

    def nodes(self) -> list[Node]:
        return [node for process in self.processes for node in process.nodes]

    def flows(self) -> list[Flow]:
        return [flow for process in self.processes for flow in process.flows]

    def plane_for(self, element_ref: str) -> tuple[str, str] | None:
        for process in self.processes:
            if process.id == element_ref and process.plane_id and process.diagram_id:
                return process.diagram_id, process.plane_id
        collaboration = self.collaboration
        if (
            collaboration is not None
            and collaboration.id == element_ref
            and collaboration.plane_id
            and collaboration.diagram_id
        ):
            return collaboration.diagram_id, collaboration.plane_id
        return None
