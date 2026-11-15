"""Канонизация модели: то, что сериализатор дописывает по умолчанию.

Нужна, чтобы сравнение «модель → XML → модель» было честным: XML всегда содержит
id плоскостей и точки связей, даже если в исходной модели их не было.
"""

from __future__ import annotations

from app.bpmn.layout import fallback_waypoints, plane_ids, sorted_artifacts
from app.bpmn.model import Artifact, ArtifactType, BpmnDocument, Flow, Node, Process


def normalize(document: BpmnDocument) -> BpmnDocument:
    """Возвращает копию модели с заполненными умолчаниями DI."""
    normalized = document.model_copy(deep=True)
    has_pools = _has_pools(normalized)
    for process in normalized.processes:
        if has_pools:
            # Всё нарисовано в плоскости коллаборации: у процессов своей нет.
            process.plane_id = None
            process.diagram_id = None
        else:
            _normalize_plane(process, process.id)
        _normalize_nodes(process.nodes)
        _normalize_flows(process.flows, process.nodes)
        _normalize_flows(process.associations, process.nodes)
        _normalize_groups(process)
        _normalize_artifacts(process.artifacts)
    collaboration = normalized.collaboration
    if collaboration is not None:
        diagram_id, plane_id = plane_ids(collaboration.id)
        collaboration.diagram_id = collaboration.diagram_id or diagram_id
        collaboration.plane_id = collaboration.plane_id or plane_id
        bounds = {participant.id: participant.bounds for participant in collaboration.participants}
        for flow in collaboration.message_flows:
            if len(flow.waypoints) < 2:
                flow.waypoints = fallback_waypoints(
                    bounds.get(flow.source_ref), bounds.get(flow.target_ref)
                )
    return normalized


def _has_pools(document: BpmnDocument) -> bool:
    collaboration = document.collaboration
    return collaboration is not None and any(
        participant.process_ref for participant in collaboration.participants
    )


def _normalize_nodes(nodes: list[Node]) -> None:
    """isExpanded живёт в DI: без фигуры ему негде храниться, значит его нет."""
    for node in nodes:
        if node.bounds is None:
            node.is_expanded = None


def _normalize_artifacts(artifacts: list[Artifact]) -> None:
    artifacts[:] = sorted_artifacts(artifacts)


def _normalize_groups(process: Process) -> None:
    """У группы в BPMN обязательна ссылка на categoryValue — дописываем канон."""
    for artifact in process.artifacts:
        if artifact.type is ArtifactType.GROUP and artifact.category_value_ref is None:
            artifact.category_value_ref = f"{artifact.id}_value"


def _normalize_plane(process: Process, element_id: str) -> None:
    diagram_id, plane_id = plane_ids(element_id)
    process.diagram_id = process.diagram_id or diagram_id
    process.plane_id = process.plane_id or plane_id


def _normalize_flows(flows: list[Flow], nodes: list[Node]) -> None:
    bounds = {node.id: node.bounds for node in nodes}
    for flow in flows:
        if len(flow.waypoints) < 2:
            flow.waypoints = fallback_waypoints(
                bounds.get(flow.source_ref), bounds.get(flow.target_ref)
            )
