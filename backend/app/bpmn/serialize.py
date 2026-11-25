"""Генерация BPMN 2.0 XML из объектной модели.

Порядок элементов соответствует XSD (`laneSet` → `flowElement*` → `artifact*`),
иначе lxml справедливо ругается на невалидный документ.
"""

from __future__ import annotations

from lxml import etree

from app.bpmn.layout import fallback_waypoints, plane_ids, sorted_artifacts
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
    Process,
)
from app.bpmn.namespaces import BPMN, BPMNDI, DC, DI, NSMAP, q

_FLOW_ELEMENT_TYPES = {
    NodeType.START_EVENT,
    NodeType.END_EVENT,
    NodeType.INTERMEDIATE_CATCH_EVENT,
    NodeType.INTERMEDIATE_THROW_EVENT,
    NodeType.BOUNDARY_EVENT,
    NodeType.TASK,
    NodeType.USER_TASK,
    NodeType.SERVICE_TASK,
    NodeType.SCRIPT_TASK,
    NodeType.MANUAL_TASK,
    NodeType.EXCLUSIVE_GATEWAY,
    NodeType.PARALLEL_GATEWAY,
    NodeType.INCLUSIVE_GATEWAY,
    NodeType.EVENT_BASED_GATEWAY,
    NodeType.SUB_PROCESS,
}


def serialize_bpmn(document: BpmnDocument) -> str:
    """Возвращает XML.

    Нетронутый документ отдаётся байт-в-байт, как пришёл. Если модель менялась,
    правки накладываются на исходное дерево XML (см. `reconcile`), чтобы не
    потерять чужие расширения.
    """
    if document.source_xml is not None:
        if _source_matches(document):
            return document.source_xml
        from app.bpmn.reconcile import reconcile_bpmn

        return reconcile_bpmn(document)

    definitions = etree.Element(q(BPMN, "definitions"), nsmap=NSMAP)
    definitions.set("id", document.id)
    definitions.set("targetNamespace", document.target_namespace)
    if document.exporter:
        definitions.set("exporter", document.exporter)

    _emit_categories(definitions, document)
    if document.collaboration is not None:
        _emit_collaboration(definitions, document.collaboration)
    for process in document.processes:
        _emit_process(definitions, process)

    # bpmn-js (как и большинство инструментов) рисует одну плоскость за раз.
    # Если есть пулы, все фигуры должны лежать в плоскости коллаборации,
    # иначе на экране останется только первый процесс.
    if _has_pools(document):
        assert document.collaboration is not None
        _emit_collaboration_plane(definitions, document.collaboration, document.processes)
    else:
        for process in document.processes:
            _emit_plane(definitions, process)
        if document.collaboration is not None:
            _emit_collaboration_plane(definitions, document.collaboration, [])

    return etree.tostring(
        definitions, pretty_print=True, xml_declaration=True, encoding="UTF-8"
    ).decode("utf-8")


def _source_matches(document: BpmnDocument) -> bool:
    """Совпадает ли модель с исходным XML (тогда можно отдать байт-в-байт)."""
    assert document.source_xml is not None
    from app.bpmn.errors import BpmnError
    from app.bpmn.parse import parse_bpmn

    try:
        return parse_bpmn(document.source_xml) == document
    except BpmnError:
        return False


def create_empty_document(name: str = "Новый процесс") -> BpmnDocument:
    """Пустая диаграмма: один процесс и пустая плоскость."""
    process = Process(
        id="Process_1",
        name=name,
        is_executable=False,
        plane_id="BPMNPlane_1",
        diagram_id="BPMNDiagram_1",
    )
    return BpmnDocument(
        id="Definitions_1",
        target_namespace="http://bpmn-studio.dev/schema",
        processes=[process],
    )


def _emit_categories(definitions: etree._Element, document: BpmnDocument) -> None:
    for process in document.processes:
        for artifact in process.artifacts:
            if artifact.type is not ArtifactType.GROUP:
                continue
            category = _sub(definitions, "category", id=f"{artifact.id}_category")
            _sub(category, "categoryValue", id=_value_id(artifact))


def _emit_collaboration(parent: etree._Element, collaboration: Collaboration) -> None:
    element = _sub(parent, "collaboration", id=collaboration.id)
    for participant in collaboration.participants:
        node = _sub(element, "participant", id=participant.id, name=participant.name)
        if participant.process_ref:
            node.set("processRef", participant.process_ref)
    for flow in collaboration.message_flows:
        _emit_flow(element, flow)


def _emit_process(parent: etree._Element, process: Process) -> None:
    element = _sub(
        parent,
        "process",
        id=process.id,
        name=process.name,
        isExecutable=_bool(process.is_executable),
    )
    _emit_documentation(element, process.documentation)

    if process.lanes:
        lane_set = _sub(element, "laneSet", id=f"{process.id}_laneSet")
        for lane in process.lanes:
            _emit_lane(lane_set, lane)

    for node in process.nodes:
        if node.type in _FLOW_ELEMENT_TYPES:
            _emit_node(element, node)
    for flow in process.flows:
        _emit_flow(element, flow)
    # Канонический порядок: объекты данных — это flowElement, остальное — artifact.
    for artifact in sorted_artifacts(process.artifacts):
        if artifact.type is ArtifactType.DATA_OBJECT:
            _emit_artifact(element, artifact)

    for artifact in sorted_artifacts(process.artifacts):
        if artifact.type is not ArtifactType.DATA_OBJECT:
            _emit_artifact(element, artifact)
    for association in process.associations:
        _emit_flow(element, association)


def _emit_lane(parent: etree._Element, lane: Lane) -> None:
    element = _sub(parent, "lane", id=lane.id, name=lane.name)
    for ref in lane.flow_node_refs:
        _sub(element, "flowNodeRef").text = ref
    if lane.child_lanes:
        child_set = _sub(element, "childLaneSet", id=f"{lane.id}_childLaneSet")
        for child in lane.child_lanes:
            _emit_lane(child_set, child)


def _emit_node(parent: etree._Element, node: Node) -> None:
    element = _sub(parent, node.type.value, id=node.id, name=node.name)
    _emit_documentation(element, node.documentation)

    if node.type is NodeType.BOUNDARY_EVENT:
        element.set("attachedToRef", node.attached_to or "")
        if node.cancel_activity is not None:
            element.set("cancelActivity", _bool(node.cancel_activity))
    if node.default_flow:
        element.set("default", node.default_flow)
    if node.type is NodeType.SERVICE_TASK and node.implementation:
        element.set("implementation", node.implementation)
    if node.type is NodeType.SCRIPT_TASK:
        # scriptFormat — атрибут самой задачи, а не элемента script (так в tScriptTask).
        # Ничего не придумываем: нет значения в модели — нет атрибута в XML.
        if node.script_format is not None:
            element.set("scriptFormat", node.script_format)
        if node.script is not None:
            _sub(element, "script").text = node.script
    if node.timer is not None:
        definition = _sub(element, "timerEventDefinition")
        _sub(definition, node.timer.kind.value).text = node.timer.expression


def _emit_flow(parent: etree._Element, flow: Flow) -> None:
    # У ассоциации в BPMN нет атрибута name — только id, концы и направление.
    name = None if flow.type is FlowType.ASSOCIATION else flow.name
    element = _sub(parent, flow.type.value, id=flow.id, name=name)
    _emit_documentation(element, flow.documentation)
    element.set("sourceRef", flow.source_ref)
    element.set("targetRef", flow.target_ref)
    if flow.condition is not None:
        condition = _sub(element, "conditionExpression")
        condition.set(
            q("http://www.w3.org/2001/XMLSchema-instance", "type"), "bpmn:tFormalExpression"
        )
        condition.text = flow.condition


def _emit_artifact(parent: etree._Element, artifact: Artifact) -> None:
    if artifact.type is ArtifactType.GROUP:
        element = _sub(parent, "group", id=artifact.id)
        element.set("categoryValueRef", artifact.category_value_ref or _value_id(artifact))
        return
    name = artifact.name if artifact.type is ArtifactType.DATA_OBJECT else None
    element = _sub(parent, artifact.type.value, id=artifact.id, name=name)
    _emit_documentation(element, artifact.documentation)
    if artifact.type is ArtifactType.TEXT_ANNOTATION and artifact.text is not None:
        _sub(element, "text").text = artifact.text


def _has_pools(document: BpmnDocument) -> bool:
    collaboration = document.collaboration
    return collaboration is not None and any(
        participant.process_ref for participant in collaboration.participants
    )


def _emit_plane(parent: etree._Element, process: Process) -> None:
    _, plane = _new_plane(
        parent,
        element_ref=process.id,
        diagram_id=process.diagram_id,
        plane_id=process.plane_id,
        suffix=process.id,
    )
    _emit_process_content(plane, process)


def _emit_process_content(plane: etree._Element, process: Process) -> None:
    for lane in _flatten(process.lanes):
        _emit_shape(plane, lane.id, lane.bounds, is_horizontal=True)
    for node in process.nodes:
        _emit_shape(plane, node.id, node.bounds, is_expanded=node.is_expanded)
    for artifact in process.artifacts:
        _emit_shape(plane, artifact.id, artifact.bounds)
    bounds = {node.id: node.bounds for node in process.nodes}
    for flow in [*process.flows, *process.associations]:
        _emit_edge(plane, flow, bounds)


def _emit_collaboration_plane(
    parent: etree._Element, collaboration: Collaboration, processes: list[Process]
) -> None:
    _diagram, plane = _new_plane(
        parent,
        element_ref=collaboration.id,
        diagram_id=collaboration.diagram_id,
        plane_id=collaboration.plane_id,
        suffix=collaboration.id,
    )
    for participant in collaboration.participants:
        _emit_shape(plane, participant.id, participant.bounds, is_horizontal=True)
    for process in processes:
        _emit_process_content(plane, process)
    bounds = {participant.id: participant.bounds for participant in collaboration.participants}
    for flow in collaboration.message_flows:
        _emit_edge(plane, flow, bounds)


def _new_plane(
    parent: etree._Element,
    *,
    element_ref: str,
    diagram_id: str | None,
    plane_id: str | None,
    suffix: str,
) -> tuple[etree._Element, etree._Element]:
    default_diagram_id, default_plane_id = plane_ids(suffix)
    diagram = _sub(parent, "BPMNDiagram", id=diagram_id or default_diagram_id)
    plane = _sub(diagram, "BPMNPlane", id=plane_id or default_plane_id)
    plane.set("bpmnElement", element_ref)
    return diagram, plane


def _emit_shape(
    plane: etree._Element,
    element_id: str,
    bounds: Bounds | None,
    *,
    is_expanded: bool | None = None,
    is_horizontal: bool | None = None,
) -> None:
    if bounds is None:
        return
    shape = _sub(plane, "BPMNShape", id=f"{element_id}_di")
    shape.set("bpmnElement", element_id)
    if is_expanded is not None:
        shape.set("isExpanded", _bool(is_expanded))
    if is_horizontal is not None:
        shape.set("isHorizontal", _bool(is_horizontal))
    _sub(
        shape,
        "Bounds",
        x=_num(bounds.x),
        y=_num(bounds.y),
        width=_num(bounds.width),
        height=_num(bounds.height),
    )


def _emit_edge(plane: etree._Element, flow: Flow, bounds: dict[str, Bounds | None]) -> None:
    edge = _sub(plane, "BPMNEdge", id=f"{flow.id}_di")
    edge.set("bpmnElement", flow.id)
    points = flow.waypoints
    if len(points) < 2:
        points = fallback_waypoints(bounds.get(flow.source_ref), bounds.get(flow.target_ref))
    for point in points:
        _sub(edge, "waypoint", x=_num(point.x), y=_num(point.y))


def _emit_documentation(element: etree._Element, documentation: str | None) -> None:
    if documentation:
        _sub(element, "documentation").text = documentation


def _flatten(lanes: list[Lane]) -> list[Lane]:
    result: list[Lane] = []
    for lane in lanes:
        result.append(lane)
        result.extend(_flatten(lane.child_lanes))
    return result


def _sub(parent: etree._Element, local_name: str, **attributes: str | None) -> etree._Element:
    tag = local_name if ":" in local_name else q(_namespace_of(local_name), local_name)
    element = etree.SubElement(parent, tag)
    for key, value in attributes.items():
        if value is not None:
            element.set(key, value)
    return element


def _namespace_of(local_name: str) -> str:
    if local_name in ("BPMNDiagram", "BPMNPlane", "BPMNShape", "BPMNEdge"):
        return BPMNDI
    if local_name == "Bounds":
        return DC
    if local_name == "waypoint":
        return DI
    return BPMN


def _bool(value: bool) -> str:
    return "true" if value else "false"


def _num(value: float) -> str:
    return str(int(value)) if value.is_integer() else f"{value:g}"


def _value_id(artifact: Artifact) -> str:
    return artifact.category_value_ref or f"{artifact.id}_value"
