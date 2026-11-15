"""Генераторы случайных, но валидных BPMN-документов для property-тестов."""

from __future__ import annotations

import hypothesis.strategies as st
from app.bpmn.model import (
    Artifact,
    ArtifactType,
    Bounds,
    BpmnDocument,
    Collaboration,
    Flow,
    FlowType,
    Lane,
    Node,
    NodeType,
    Participant,
    Process,
    Waypoint,
)

#: Спецсимволы включены намеренно: проверяем, что экранирование симметрично.
ALPHABET = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя ABCxyz0123456789-_.:&<>\"'"

_NAMES = st.one_of(st.none(), st.text(alphabet=ALPHABET, min_size=1, max_size=20))
_DOCS = st.one_of(st.none(), st.text(alphabet=ALPHABET, min_size=1, max_size=40))
_QNAME = st.from_regex(r"[A-Za-z_][A-Za-z0-9_]{0,15}", fullmatch=True)
_COORDS = st.integers(min_value=0, max_value=2000).map(float)
_SIZES = st.integers(min_value=20, max_value=400).map(float)

_BOUNDS = st.builds(Bounds, x=_COORDS, y=_COORDS, width=_SIZES, height=_SIZES)
_OPTIONAL_BOUNDS = st.one_of(st.none(), _BOUNDS)

_NODE_TYPES = st.sampled_from(
    [
        NodeType.START_EVENT,
        NodeType.END_EVENT,
        NodeType.TASK,
        NodeType.USER_TASK,
        NodeType.SERVICE_TASK,
        NodeType.SCRIPT_TASK,
        NodeType.MANUAL_TASK,
        NodeType.EXCLUSIVE_GATEWAY,
        NodeType.PARALLEL_GATEWAY,
        NodeType.INCLUSIVE_GATEWAY,
        NodeType.INTERMEDIATE_CATCH_EVENT,
        NodeType.INTERMEDIATE_THROW_EVENT,
        NodeType.SUB_PROCESS,
    ]
)


@st.composite
def _flows(draw: st.DrawFn, node_ids: list[str], flow_type: FlowType, prefix: str) -> list[Flow]:
    count = draw(st.integers(min_value=0, max_value=5))
    result: list[Flow] = []
    for index in range(count):
        source, target = draw(st.tuples(st.sampled_from(node_ids), st.sampled_from(node_ids)))
        waypoints = draw(
            st.lists(
                st.builds(Waypoint, x=_COORDS, y=_COORDS),
                min_size=0,
                max_size=4,
            )
        )
        result.append(
            Flow(
                id=f"{prefix}{flow_type.value}_{index}",
                type=flow_type,
                name=draw(_NAMES) if flow_type is not FlowType.ASSOCIATION else None,
                source_ref=source,
                target_ref=target,
                condition=(draw(_DOCS) if flow_type is FlowType.SEQUENCE else None),
                waypoints=waypoints,
            )
        )
    return result


@st.composite
def _nodes(draw: st.DrawFn, prefix: str) -> list[Node]:
    count = draw(st.integers(min_value=1, max_value=5))
    nodes: list[Node] = []
    for index in range(count):
        node_type = draw(_NODE_TYPES)
        node_id = f"{prefix}Node_{index}"
        attached_to = None
        cancel_activity = None
        implementation = None
        script_format = None
        script = None
        is_expanded = None

        if node_type is NodeType.BOUNDARY_EVENT and nodes:
            attached_to = draw(st.sampled_from([node.id for node in nodes]))
            cancel_activity = draw(st.booleans())
        if node_type is NodeType.SERVICE_TASK:
            implementation = draw(_QNAME)
        if node_type is NodeType.SCRIPT_TASK:
            script_format = draw(_NAMES)
            script = draw(_DOCS)
        if node_type is NodeType.SUB_PROCESS:
            is_expanded = draw(st.booleans())

        nodes.append(
            Node(
                id=node_id,
                type=node_type,
                name=draw(_NAMES),
                documentation=draw(_DOCS),
                bounds=draw(_OPTIONAL_BOUNDS),
                attached_to=attached_to,
                cancel_activity=cancel_activity,
                implementation=implementation,
                script_format=script_format,
                script=script,
                is_expanded=is_expanded,
            )
        )
    return nodes


@st.composite
def _lanes(draw: st.DrawFn, node_ids: list[str], prefix: str) -> list[Lane]:
    count = draw(st.integers(min_value=0, max_value=2))
    return [
        Lane(
            id=f"{prefix}Lane_{index}",
            name=draw(_NAMES),
            bounds=draw(_OPTIONAL_BOUNDS),
            flow_node_refs=draw(
                st.lists(st.sampled_from(node_ids), max_size=len(node_ids), unique=True)
            ),
        )
        for index in range(count)
    ]


@st.composite
def _artifacts(draw: st.DrawFn, prefix: str) -> list[Artifact]:
    count = draw(st.integers(min_value=0, max_value=3))
    result: list[Artifact] = []
    for index in range(count):
        artifact_type = draw(
            st.sampled_from(
                [ArtifactType.TEXT_ANNOTATION, ArtifactType.DATA_OBJECT, ArtifactType.GROUP]
            )
        )
        result.append(
            Artifact(
                id=f"{prefix}Artifact_{index}",
                type=artifact_type,
                name=draw(_NAMES) if artifact_type is ArtifactType.DATA_OBJECT else None,
                bounds=draw(_OPTIONAL_BOUNDS),
                text=draw(_DOCS) if artifact_type is ArtifactType.TEXT_ANNOTATION else None,
                # xs:ID должен быть уникален на весь документ — заводим от префикса
                category_value_ref=(
                    f"{prefix}CatVal_{index}" if artifact_type is ArtifactType.GROUP else None
                ),
            )
        )
    return result


@st.composite
def _processes(draw: st.DrawFn) -> list[Process]:
    count = draw(st.integers(min_value=1, max_value=2))
    processes: list[Process] = []
    for index in range(count):
        prefix = f"P{index}_"
        nodes = draw(_nodes(prefix))
        node_ids = [node.id for node in nodes]
        processes.append(
            Process(
                id=f"Process_{index}",
                name=draw(_NAMES),
                documentation=draw(_DOCS),
                is_executable=draw(st.booleans()),
                nodes=nodes,
                flows=draw(_flows(node_ids, FlowType.SEQUENCE, prefix)),
                associations=draw(_flows(node_ids, FlowType.ASSOCIATION, prefix)),
                lanes=draw(_lanes(node_ids, prefix)),
                artifacts=draw(_artifacts(prefix)),
            )
        )
    return processes


@st.composite
def _collaboration(draw: st.DrawFn, process_ids: list[str]) -> Collaboration | None:
    if not draw(st.booleans()):
        return None
    participants = [
        Participant(
            id=f"Participant_{index}",
            name=draw(_NAMES),
            process_ref=process_id,
            bounds=draw(_OPTIONAL_BOUNDS),
        )
        for index, process_id in enumerate(process_ids)
    ]
    participant_ids = [participant.id for participant in participants]
    return Collaboration(
        id="Collaboration_1",
        participants=participants,
        message_flows=draw(_flows(participant_ids, FlowType.MESSAGE, "M_")),
    )


@st.composite
def bpmn_documents(draw: st.DrawFn) -> BpmnDocument:
    processes = draw(_processes())
    return BpmnDocument(
        id="Definitions_1",
        target_namespace="http://bpmn-studio.dev/schema",
        exporter=draw(_NAMES),
        processes=processes,
        collaboration=draw(_collaboration([process.id for process in processes])),
    )
