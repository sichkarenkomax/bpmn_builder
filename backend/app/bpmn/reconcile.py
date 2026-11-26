"""Реконсиляция: правки модели поверх исходного дерева XML.

Задача модуля — сохранить документ, который мы не писали целиком: незнакомые
элементы, вендорские атрибуты (`camunda:*`, `bizagi:*`), лишние DI-атрибуты и
прочие расширения остаются на месте. Меняется только то, что модель знает:
атрибуты, документация, состав элементов и геометрия.

Если элементов в модели больше нет — они удаляются вместе со своей геометрией.
Если появились новые — они добавляются в корректную позицию по XSD.
"""

from __future__ import annotations

from lxml import etree

from app.bpmn.layout import fallback_waypoints
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
from app.bpmn.namespaces import BPMN, BPMNDI, DC, q
from app.bpmn.serialize import (
    _emit_artifact,
    _emit_flow,
    _emit_lane,
    _emit_node,
    _sub,
    _walk_flows,
    _walk_nodes,
)

_ARTIFACT_TAGS = {artifact_type.value for artifact_type in ArtifactType}
_FLOW_TAGS = {flow_type.value for flow_type in FlowType}

#: Что по XSD идёт после flowElement: новые узлы и связи вставляем перед этим.
_TRAILING_TAGS = _ARTIFACT_TAGS | {
    "association",
    "resourceRole",
    "property",
    "ioSpecification",
    "auditing",
    "monitoring",
    "supports",
    "correlationSubscription",
    "dataStoreReference",
}

_BPMN_NS = f"{{{BPMN}}}"


def reconcile_bpmn(document: BpmnDocument) -> str:
    """Применяет модель к исходному XML, сохраняя чужие расширения."""
    if document.source_xml is None:
        msg = "реконсиляция требует исходный XML: документ собран с нуля"
        raise ValueError(msg)

    parser = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)
    root = etree.fromstring(document.source_xml.encode("utf-8"), parser=parser)

    root.set("id", document.id)
    root.set("targetNamespace", document.target_namespace)
    if document.exporter is not None:
        root.set("exporter", document.exporter)

    _sync_collaboration(root, document.collaboration)
    _sync_processes(root, document.processes)
    _sync_di(root, document)

    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="UTF-8").decode(
        "utf-8"
    )


# --- процессы и их содержимое ------------------------------------------------


def _sync_processes(root: etree._Element, processes: list[Process]) -> None:
    existing = {element.get("id"): element for element in root.findall(q(BPMN, "process"))}
    for process in processes:
        element = existing.get(process.id)
        if element is not None:
            del existing[process.id]
        else:
            element = _new_process(process)
            _insert_before_trailing(root, element)
        _sync_process(element, process)
    for stale in existing.values():
        root.remove(stale)


def _sync_process(element: etree._Element, process: Process) -> None:
    _set_or_remove(element, "name", process.name)
    element.set("isExecutable", "true" if process.is_executable else "false")
    _sync_documentation(element, process.documentation)
    _sync_lanes(element, process.lanes)
    _sync_children(element, process)
    for node in process.nodes:
        node_element = _find_child(element, node.id)
        if node_element is not None:
            _sync_io_refs(node_element, process, node.id)


def _find_child(parent: etree._Element, element_id: str) -> etree._Element | None:
    for child in parent:
        if child.get("id") == element_id:
            return child
    return None


def _new_process(process: Process) -> etree._Element:
    element = etree.Element(q(BPMN, "process"))
    element.set("id", process.id)
    return element


def _sync_children(parent: etree._Element, process: Process) -> None:
    """Узлы, связи и артефакты процесса: обновить, добавить, убрать лишние."""
    by_id: dict[str, etree._Element] = {}
    for child in parent:
        element_id = child.get("id")
        if element_id:
            by_id[element_id] = child

    model_ids: set[str] = set()

    for node in process.nodes:
        model_ids.add(node.id)
        element = by_id.get(node.id)
        if element is None:
            _insert_before_trailing(parent, _build_node(node))
        else:
            _sync_node(element, node)

    for flow in [*process.flows, *process.associations]:
        model_ids.add(flow.id)
        element = by_id.get(flow.id)
        if element is None:
            _insert_before_trailing(parent, _build_flow(flow))
        else:
            _sync_flow(element, flow)

    for artifact in process.artifacts:
        model_ids.add(artifact.id)
        element = by_id.get(artifact.id)
        if element is None:
            _insert_before_trailing(parent, _build_artifact(artifact))
        else:
            _sync_artifact(element, artifact)

    for element_id, element in by_id.items():
        local = etree.QName(element).localname
        if element_id in model_ids:
            continue
        if local in _node_types() or local in _FLOW_TAGS or local in _ARTIFACT_TAGS:
            parent.remove(element)


def _sync_node(element: etree._Element, node: Node) -> None:
    if etree.QName(element).localname != node.type.value:
        element = _replace(
            element,
            _build_node(node),
            copy_vendor_attributes=True,
        )
    _set_or_remove(element, "name", node.name)
    _set_or_remove(element, "default", node.default_flow)
    _sync_documentation(element, node.documentation)

    if node.type is NodeType.BOUNDARY_EVENT:
        element.set("attachedToRef", node.attached_to or "")
        _set_or_remove(
            element,
            "cancelActivity",
            None if node.cancel_activity is None else _bool(node.cancel_activity),
        )
    else:
        _set_or_remove(element, "attachedToRef", None)
        _set_or_remove(element, "cancelActivity", None)

    if node.type is NodeType.SERVICE_TASK:
        _set_or_remove(element, "implementation", node.implementation)
    else:
        _set_or_remove(element, "implementation", None)

    if node.type is NodeType.SCRIPT_TASK:
        _set_or_remove(element, "scriptFormat", node.script_format)
        _sync_text_child(element, "script", node.script)
    else:
        _set_or_remove(element, "scriptFormat", None)
        _sync_text_child(element, "script", None)

    if node.type is NodeType.SUB_PROCESS:
        _sync_inner_children(element, node)


def _sync_inner_children(parent: etree._Element, node: Node) -> None:
    """Вложенные узлы и потоки подпроцесса: обновить, добавить, убрать лишние."""
    by_id: dict[str, etree._Element] = {}
    for child in parent:
        element_id = child.get("id")
        if element_id:
            by_id[element_id] = child

    model_ids: set[str] = set()

    for child_node in node.nodes:
        model_ids.add(child_node.id)
        element = by_id.get(child_node.id)
        if element is None:
            _insert_before_trailing(parent, _build_node(child_node))
        else:
            _sync_node(element, child_node)

    for flow in node.flows:
        model_ids.add(flow.id)
        element = by_id.get(flow.id)
        if element is None:
            _insert_before_trailing(parent, _build_flow(flow))
        else:
            _sync_flow(element, flow)

    for element_id, element in by_id.items():
        if element_id in model_ids:
            continue
        local = etree.QName(element).localname
        if local in _node_types() or local in _FLOW_TAGS:
            parent.remove(element)


def _sync_flow(element: etree._Element, flow: Flow) -> None:
    if etree.QName(element).localname != flow.type.value:
        element = _replace(element, _build_flow(flow), copy_vendor_attributes=True)
    name = None if flow.type is FlowType.ASSOCIATION else flow.name
    _set_or_remove(element, "name", name)
    _sync_documentation(element, flow.documentation)
    element.set("sourceRef", flow.source_ref)
    element.set("targetRef", flow.target_ref)

    condition = element.find(q(BPMN, "conditionExpression"))
    if flow.condition is None:
        if condition is not None:
            element.remove(condition)
        return
    if condition is None:
        condition = etree.SubElement(element, q(BPMN, "conditionExpression"))
    condition.set(q("http://www.w3.org/2001/XMLSchema-instance", "type"), "bpmn:tFormalExpression")
    condition.text = flow.condition


def _sync_artifact(element: etree._Element, artifact: Artifact) -> None:
    if etree.QName(element).localname != artifact.type.value:
        element = _replace(element, _build_artifact(artifact), copy_vendor_attributes=True)
    if artifact.type is ArtifactType.DATA_OBJECT:
        _set_or_remove(element, "name", artifact.name)
    else:
        _set_or_remove(element, "name", None)
    _sync_documentation(element, artifact.documentation)
    if artifact.type is ArtifactType.GROUP:
        element.set("categoryValueRef", artifact.category_value_ref or f"{artifact.id}_value")
    if artifact.type is ArtifactType.TEXT_ANNOTATION:
        _sync_text_child(element, "text", artifact.text)


# --- дорожки -----------------------------------------------------------------


def _sync_lanes(process_element: etree._Element, lanes: list[Lane]) -> None:
    lane_set = process_element.find(q(BPMN, "laneSet"))
    if not lanes:
        if lane_set is not None:
            process_element.remove(lane_set)
        return
    if lane_set is None:
        lane_set = etree.Element(q(BPMN, "laneSet"))
        lane_set.set("id", f"{process_element.get('id')}_laneSet")
        process_element.insert(0, lane_set)
    _sync_lane_children(lane_set, lanes)


def _sync_lane_children(parent: etree._Element, lanes: list[Lane]) -> None:
    existing = {element.get("id"): element for element in parent.findall(q(BPMN, "lane"))}
    for lane in lanes:
        element = existing.get(lane.id)
        if element is not None:
            del existing[lane.id]
        else:
            element = _build_lane(lane)
            parent.append(element)
        _set_or_remove(element, "name", lane.name)
        _sync_flow_node_refs(element, lane.flow_node_refs)
        child_set = element.find(q(BPMN, "childLaneSet"))
        if lane.child_lanes:
            if child_set is None:
                child_set = etree.SubElement(element, q(BPMN, "childLaneSet"))
                child_set.set("id", f"{lane.id}_childLaneSet")
            _sync_lane_children(child_set, lane.child_lanes)
        elif child_set is not None:
            element.remove(child_set)
    for stale in existing.values():
        parent.remove(stale)


def _sync_flow_node_refs(element: etree._Element, refs: list[str]) -> None:
    for child in element.findall(q(BPMN, "flowNodeRef")):
        element.remove(child)
    for ref in refs:
        _sub(element, "flowNodeRef").text = ref


# --- коллаборация ------------------------------------------------------------


def _sync_collaboration(root: etree._Element, collaboration: Collaboration | None) -> None:
    existing = {element.get("id"): element for element in root.findall(q(BPMN, "collaboration"))}
    if collaboration is None:
        for stale in existing.values():
            root.remove(stale)
        return
    element = existing.get(collaboration.id)
    if element is not None:
        del existing[collaboration.id]
    else:
        element = _sub(root, "collaboration", id=collaboration.id)

    participants = {participant.id: participant for participant in collaboration.participants}
    flows = {flow.id: flow for flow in collaboration.message_flows}
    seen_participants: set[str] = set()
    seen_flows: set[str] = set()

    for child in list(element):
        local = etree.QName(child).localname
        if local == "participant":
            participant = participants.get(child.get("id") or "")
            if participant is None:
                element.remove(child)
                continue
            seen_participants.add(participant.id)
            _set_or_remove(child, "name", participant.name)
            _set_or_remove(child, "processRef", participant.process_ref)
        elif local == "messageFlow":
            flow = flows.get(child.get("id") or "")
            if flow is None:
                element.remove(child)
                continue
            seen_flows.add(flow.id)
            _sync_flow(child, flow)

    for participant in collaboration.participants:
        if participant.id in seen_participants:
            continue
        node = _sub(element, "participant", id=participant.id, name=participant.name)
        if participant.process_ref:
            node.set("processRef", participant.process_ref)

    for flow in collaboration.message_flows:
        if flow.id not in seen_flows:
            element.append(_build_flow(flow))


# --- DI ----------------------------------------------------------------------


def _sync_di(root: etree._Element, document: BpmnDocument) -> None:
    if document.collaboration is not None:
        _sync_plane(root, document.collaboration, document.processes)
    else:
        for process in document.processes:
            _sync_plane(root, process, [])


def _sync_plane(
    root: etree._Element,
    owner: Process | Collaboration,
    processes: list[Process],
) -> None:
    plane = _find_plane(root, owner.id)
    has_geometry = _owner_has_geometry(owner, processes)
    if plane is None:
        if not has_geometry:
            return
        from app.bpmn.serialize import _new_plane

        _diagram, plane = _new_plane(
            root,
            element_ref=owner.id,
            diagram_id=owner.diagram_id,
            plane_id=owner.plane_id,
            suffix=owner.id,
        )

    if isinstance(owner, Collaboration):
        for participant in owner.participants:
            _upsert_shape(plane, participant.id, participant.bounds, is_horizontal=True)
        for process in processes:
            _upsert_process_shapes(plane, process)
        for flow in owner.message_flows:
            _upsert_edge(plane, flow, _participant_bounds(owner))
    else:
        _upsert_process_shapes(plane, owner)

    known = _bpmn_ids(root)
    for child in list(plane):
        if etree.QName(child).localname not in ("BPMNShape", "BPMNEdge"):
            continue
        ref = child.get("bpmnElement")
        if ref and ref not in known:
            plane.remove(child)


def _upsert_process_shapes(plane: etree._Element, process: Process) -> None:
    for lane in _flatten(process.lanes):
        _upsert_shape(plane, lane.id, lane.bounds, is_horizontal=True)
    nodes = list(_walk_nodes(process.nodes))
    for node in nodes:
        _upsert_shape(plane, node.id, node.bounds, is_expanded=node.is_expanded)
    for artifact in process.artifacts:
        _upsert_shape(plane, artifact.id, artifact.bounds)
    bounds = {node.id: node.bounds for node in nodes}
    for flow in [*_walk_flows(process.nodes, process.flows), *process.associations]:
        _upsert_edge(plane, flow, bounds)


def _participant_bounds(collaboration: Collaboration) -> dict[str, Bounds | None]:
    return {participant.id: participant.bounds for participant in collaboration.participants}


def _upsert_shape(
    plane: etree._Element,
    element_id: str,
    bounds: Bounds | None,
    *,
    is_expanded: bool | None = None,
    is_horizontal: bool | None = None,
) -> None:
    shape = _find_by_ref(plane, "BPMNShape", element_id)
    if bounds is None:
        if shape is not None:
            plane.remove(shape)
        return
    if shape is None:
        shape = etree.SubElement(plane, q(BPMNDI, "BPMNShape"))
        shape.set("id", f"{element_id}_di")
        shape.set("bpmnElement", element_id)
    if is_expanded is not None:
        shape.set("isExpanded", _bool(is_expanded))
    if is_horizontal and shape.get("isHorizontal") is None:
        shape.set("isHorizontal", "true")
    bounds_element = shape.find(q(DC, "Bounds"))
    if bounds_element is None:
        bounds_element = etree.SubElement(shape, q(DC, "Bounds"))
    bounds_element.set("x", _num(bounds.x))
    bounds_element.set("y", _num(bounds.y))
    bounds_element.set("width", _num(bounds.width))
    bounds_element.set("height", _num(bounds.height))


def _upsert_edge(
    plane: etree._Element,
    flow: Flow,
    bounds: dict[str, Bounds | None],
) -> None:
    edge = _find_by_ref(plane, "BPMNEdge", flow.id)
    points = flow.waypoints
    if len(points) < 2:
        points = fallback_waypoints(bounds.get(flow.source_ref), bounds.get(flow.target_ref))
    if not points:
        if edge is not None:
            plane.remove(edge)
        return
    if edge is None:
        edge = etree.SubElement(plane, q(BPMNDI, "BPMNEdge"))
        edge.set("id", f"{flow.id}_di")
        edge.set("bpmnElement", flow.id)
    for existing_point in edge.findall(q("http://www.omg.org/spec/DD/20100524/DI", "waypoint")):
        edge.remove(existing_point)
    for point in points:
        waypoint = etree.SubElement(edge, q("http://www.omg.org/spec/DD/20100524/DI", "waypoint"))
        waypoint.set("x", _num(point.x))
        waypoint.set("y", _num(point.y))


def _find_plane(root: etree._Element, element_ref: str) -> etree._Element | None:
    for diagram in root.findall(q(BPMNDI, "BPMNDiagram")):
        for plane in diagram.findall(q(BPMNDI, "BPMNPlane")):
            if plane.get("bpmnElement") == element_ref:
                return plane
    return None


def _find_by_ref(plane: etree._Element, local_name: str, element_ref: str) -> etree._Element | None:
    for candidate in plane.findall(q(BPMNDI, local_name)):
        if candidate.get("bpmnElement") == element_ref:
            return candidate
    return None


def _owner_has_geometry(owner: Process | Collaboration, processes: list[Process]) -> bool:
    if isinstance(owner, Collaboration):
        if any(participant.bounds for participant in owner.participants):
            return True
        return any(_process_has_geometry(process) for process in processes)
    return _process_has_geometry(owner)


def _process_has_geometry(process: Process) -> bool:
    if any(node.bounds for node in process.nodes):
        return True
    if any(lane.bounds for lane in _flatten(process.lanes)):
        return True
    if any(artifact.bounds for artifact in process.artifacts):
        return True
    return any(flow.waypoints for flow in [*process.flows, *process.associations])


def _bpmn_ids(root: etree._Element) -> set[str]:
    ids: set[str] = set()
    for element in root.iter():
        tag = element.tag
        if isinstance(tag, str) and tag.startswith(_BPMN_NS):
            element_id = element.get("id")
            if element_id:
                ids.add(element_id)
    return ids


# --- общие помощники ---------------------------------------------------------


def _build_node(node: Node) -> etree._Element:
    temp = etree.Element(q(BPMN, "process"))
    _emit_node(temp, node)
    return temp[0]


def _build_flow(flow: Flow) -> etree._Element:
    temp = etree.Element(q(BPMN, "process"))
    _emit_flow(temp, flow)
    return temp[0]


def _build_artifact(artifact: Artifact) -> etree._Element:
    temp = etree.Element(q(BPMN, "process"))
    _emit_artifact(temp, artifact)
    return temp[0]


def _build_lane(lane: Lane) -> etree._Element:
    temp = etree.Element(q(BPMN, "laneSet"))
    _emit_lane(temp, lane)
    return temp[0]


def _replace(
    old: etree._Element,
    new: etree._Element,
    *,
    copy_vendor_attributes: bool,
) -> etree._Element:
    """Заменяет элемент, перенося расширения и (опционально) чужие атрибуты."""
    for child in old:
        if etree.QName(child).localname == "extensionElements":
            new.insert(0, child)
    if copy_vendor_attributes:
        for name, value in old.attrib.items():
            is_vendor = isinstance(name, str) and not name.startswith(_BPMN_NS)
            if is_vendor and name not in new.attrib:
                new.set(name, value)
    parent = old.getparent()
    if parent is None:
        msg = "нельзя заменить элемент без родителя"
        raise ValueError(msg)
    parent.replace(old, new)
    return new


def _sync_documentation(element: etree._Element, documentation: str | None) -> None:
    existing = element.find(q(BPMN, "documentation"))
    if not documentation:
        if existing is not None:
            element.remove(existing)
        return
    if existing is None:
        # documentation по XSD идёт первой — вставляем перед остальными детьми.
        existing = etree.Element(q(BPMN, "documentation"))
        element.insert(0, existing)
    existing.text = documentation


def _sync_text_child(element: etree._Element, local_name: str, text: str | None) -> None:
    existing = element.find(q(BPMN, local_name))
    if text is None:
        if existing is not None:
            element.remove(existing)
        return
    if existing is None:
        existing = etree.SubElement(element, q(BPMN, local_name))
    existing.text = text


def _sync_io_refs(element: etree._Element, process: Process, element_id: str) -> None:
    """Приводит incoming/outgoing к модели, не трогая остальных детей."""
    for child in list(element):
        if etree.QName(child).localname in ("incoming", "outgoing"):
            element.remove(child)

    incoming: dict[str, list[str]] = {}
    outgoing: dict[str, list[str]] = {}
    for flow in process.flows:
        outgoing.setdefault(flow.source_ref, []).append(flow.id)
        incoming.setdefault(flow.target_ref, []).append(flow.id)

    index = 0
    for child in element:
        if etree.QName(child).localname in ("documentation", "extensionElements"):
            index = element.index(child) + 1
    for ref in incoming.get(element_id, []):
        node = etree.Element(q(BPMN, "incoming"))
        node.text = ref
        element.insert(index, node)
        index += 1
    for ref in outgoing.get(element_id, []):
        node = etree.Element(q(BPMN, "outgoing"))
        node.text = ref
        element.insert(index, node)
        index += 1


def _insert_before_trailing(parent: etree._Element, element: etree._Element) -> None:
    for index, child in enumerate(parent):
        if etree.QName(child).localname in _TRAILING_TAGS:
            parent.insert(index, element)
            return
    parent.append(element)


def _set_or_remove(element: etree._Element, name: str, value: str | None) -> None:
    if value is None:
        if name in element.attrib:
            del element.attrib[name]
    else:
        element.set(name, value)


def _node_types() -> set[str]:
    return {node_type.value for node_type in NodeType}


def _flatten(lanes: list[Lane]) -> list[Lane]:
    result: list[Lane] = []
    for lane in lanes:
        result.append(lane)
        result.extend(_flatten(lane.child_lanes))
    return result


def _bool(value: bool) -> str:
    return "true" if value else "false"


def _num(value: float) -> str:
    return str(int(value)) if value.is_integer() else f"{value:g}"
