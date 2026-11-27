"""Разбор BPMN 2.0 XML в объектную модель.

Чужие расширения (`camunda:*`, `bizagi:*` и любые незнакомые узлы) не разбираются,
но и не теряются: исходный XML сохраняется в документе целиком и возвращается
при сохранении без изменений (см. ADR-003).
"""

from __future__ import annotations

from lxml import etree

from app.bpmn.errors import BpmnModelError, BpmnSyntaxError
from app.bpmn.model import (
    Artifact,
    ArtifactType,
    Bounds,
    BpmnDocument,
    Collaboration,
    ErrorDefinition,
    Flow,
    FlowType,
    Lane,
    Node,
    NodeType,
    Participant,
    Process,
    TimerDefinition,
    TimerKind,
    Waypoint,
)
from app.bpmn.namespaces import BPMN, BPMNDI, DC, DI, q

_DIAGRAM = q(BPMNDI, "BPMNDiagram")
_PLANE = q(BPMNDI, "BPMNPlane")
_SHAPE = q(BPMNDI, "BPMNShape")
_EDGE = q(BPMNDI, "BPMNEdge")
_BOUNDS = q(DC, "Bounds")
_WAYPOINT = q(DI, "waypoint")

_NODE_TYPES = {node_type.value: node_type for node_type in NodeType}
_TIMER_KINDS = {kind.value: kind for kind in TimerKind}
_ARTIFACT_TYPES = {artifact_type.value: artifact_type for artifact_type in ArtifactType}


class _DiIndex:
    """Геометрия одной плоскости: формы по bpmnElement и связи по waypoints."""

    def __init__(self) -> None:
        self.bounds: dict[str, Bounds] = {}
        self.waypoints: dict[str, list[Waypoint]] = {}
        self.expanded: dict[str, bool] = {}

    def merge(self, other: _DiIndex) -> None:
        self.bounds.update(other.bounds)
        self.waypoints.update(other.waypoints)
        self.expanded.update(other.expanded)

    def add_shape(self, element: etree._Element) -> None:
        ref = element.get("bpmnElement")
        if not ref:
            return
        bounds_el = element.find(_BOUNDS)
        if bounds_el is not None:
            self.bounds[ref] = Bounds(
                x=_float(bounds_el, "x"),
                y=_float(bounds_el, "y"),
                width=_float(bounds_el, "width"),
                height=_float(bounds_el, "height"),
            )
        expanded = element.get("isExpanded")
        if expanded is not None:
            self.expanded[ref] = expanded == "true"

    def add_edge(self, element: etree._Element) -> None:
        ref = element.get("bpmnElement")
        if not ref:
            return
        points = [
            Waypoint(x=_float(point, "x"), y=_float(point, "y"))
            for point in element.findall(_WAYPOINT)
        ]
        if points:
            self.waypoints[ref] = points


class _DiDocument:
    """Все плоскости документа: своя геометрия у каждого процесса.

    Плоскости разделены намеренно: одинаковые id в разных процессах — ошибка BPMN,
    но чужие файлы её допускают, и геометрия одного процесса не должна протекать
    в другой.
    """

    def __init__(self) -> None:
        self.by_plane: dict[str, _DiIndex] = {}
        self.planes: dict[str, tuple[str, str]] = {}
        self._merged: _DiIndex | None = None

    def index_for(self, element_ref: str) -> _DiIndex:
        own = self.by_plane.get(element_ref)
        if own is not None:
            return own
        if self._merged is None:
            merged = _DiIndex()
            for index in self.by_plane.values():
                merged.merge(index)
            self._merged = merged
        return self._merged


def parse_bpmn(payload: str | bytes, *, root: etree._Element | None = None) -> BpmnDocument:
    """Разбирает XML в модель. Исходный XML остаётся доступен через `source_xml`.

    `root` позволяет переиспользовать дерево, уже разобранное для XSD-валидации.
    """
    raw = payload.encode("utf-8") if isinstance(payload, str) else payload
    if root is None:
        parser = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)
        try:
            root = etree.fromstring(raw, parser=parser)
        except etree.XMLSyntaxError as exc:
            raise BpmnSyntaxError(str(exc), line=exc.lineno, column=exc.offset) from exc

    # DTD и внешние сущности не поддерживаем: это и XXE, и лишний источник 500.
    # Стабы lxml не аннотируют docinfo.doctype — проверяем тип сами.
    doctype: object = getattr(root.getroottree().docinfo, "doctype", "")
    if isinstance(doctype, str) and doctype != "":
        raise BpmnSyntaxError("DTD и внешние сущности не поддерживаются", line=_line(root))

    if root.tag != q(BPMN, "definitions"):
        raise BpmnSyntaxError(
            "корневой элемент должен быть bpmn:definitions",
            line=_line(root),
            column=_column(root),
        )

    di = _collect_di(root)
    processes = [
        _parse_process(element, di, index)
        for index, element in enumerate(root.findall(q(BPMN, "process")))
    ]
    collaboration_el = root.find(q(BPMN, "collaboration"))
    collaboration = (
        _parse_collaboration(collaboration_el, di) if collaboration_el is not None else None
    )
    errors = [
        ErrorDefinition(
            id=element.get("id") or f"Error_{index + 1}",
            name=element.get("name"),
            error_code=element.get("errorCode"),
        )
        for index, element in enumerate(root.findall(q(BPMN, "error")))
    ]

    document = BpmnDocument(
        id=root.get("id") or "Definitions_1",
        target_namespace=root.get("targetNamespace") or "http://bpmn-studio.dev/schema",
        exporter=root.get("exporter"),
        processes=processes,
        collaboration=collaboration,
        errors=errors,
    )
    return document.keep_source(raw.decode("utf-8"))


def _collect_di(root: etree._Element) -> _DiDocument:
    document = _DiDocument()
    for diagram in root.findall(_DIAGRAM):
        for plane in diagram.findall(_PLANE):
            ref = plane.get("bpmnElement")
            if not ref:
                continue
            index = _DiIndex()
            for shape in plane.findall(_SHAPE):
                index.add_shape(shape)
            for edge in plane.findall(_EDGE):
                index.add_edge(edge)
            document.by_plane[ref] = index
            diagram_id = diagram.get("id")
            plane_id = plane.get("id")
            if diagram_id and plane_id:
                document.planes[ref] = (diagram_id, plane_id)
    return document


def _parse_process(element: etree._Element, di: _DiDocument, index: int) -> Process:
    process_id = element.get("id") or f"Process_{index + 1}"
    plane_index = di.index_for(process_id)
    lane_set = element.find(q(BPMN, "laneSet"))
    lanes = _parse_lanes(lane_set, plane_index) if lane_set is not None else []

    nodes: list[Node] = []
    flows: list[Flow] = []
    associations: list[Flow] = []
    artifacts: list[Artifact] = []

    for child in element:
        local = etree.QName(child).localname
        if local in _NODE_TYPES:
            nodes.append(_parse_node(child, _NODE_TYPES[local], plane_index))
        elif local == "sequenceFlow":
            flows.append(_parse_flow(child, FlowType.SEQUENCE, plane_index))
        elif local == "association":
            associations.append(_parse_flow(child, FlowType.ASSOCIATION, plane_index))
        elif local in _ARTIFACT_TYPES:
            artifacts.append(_parse_artifact(child, _ARTIFACT_TYPES[local], plane_index))

    plane = di.planes.get(process_id)
    return Process(
        id=process_id,
        name=element.get("name"),
        is_executable=element.get("isExecutable") == "true",
        documentation=_documentation(element),
        nodes=nodes,
        flows=flows,
        associations=associations,
        lanes=lanes,
        artifacts=artifacts,
        plane_id=plane[1] if plane else None,
        diagram_id=plane[0] if plane else None,
    )


def _flatten(lanes: list[Lane]) -> list[Lane]:
    result: list[Lane] = []
    for lane in lanes:
        result.append(lane)
        result.extend(_flatten(lane.child_lanes))
    return result


def _parse_lanes(lane_set: etree._Element, di: _DiIndex) -> list[Lane]:
    return [_parse_lane(element, di) for element in lane_set.findall(q(BPMN, "lane"))]


def _parse_lane(element: etree._Element, di: _DiIndex) -> Lane:
    lane_id = element.get("id") or "Lane_1"
    child_set = element.find(q(BPMN, "childLaneSet"))
    child_lanes = _parse_lanes(child_set, di) if child_set is not None else []
    return Lane(
        id=lane_id,
        name=element.get("name"),
        bounds=di.bounds.get(lane_id),
        flow_node_refs=[
            ref.text.strip()
            for ref in element.findall(q(BPMN, "flowNodeRef"))
            if ref.text and ref.text.strip()
        ],
        child_lanes=child_lanes,
    )


def _parse_inner(element: etree._Element, di: _DiIndex) -> tuple[list[Node], list[Flow]]:
    """Вложенные элементы подпроцесса: узлы и потоки последовательности."""
    nodes: list[Node] = []
    flows: list[Flow] = []
    for child in element:
        local = etree.QName(child).localname
        if local in _NODE_TYPES:
            nodes.append(_parse_node(child, _NODE_TYPES[local], di))
        elif local == "sequenceFlow":
            flows.append(_parse_flow(child, FlowType.SEQUENCE, di))
    return nodes, flows


def _parse_node(element: etree._Element, node_type: NodeType, di: _DiIndex) -> Node:
    node_id = element.get("id")
    if not node_id:
        raise BpmnModelError(f"у элемента {node_type.value} нет id", line=_line(element))
    script = element.find(q(BPMN, "script"))
    node = Node(
        id=node_id,
        type=node_type,
        name=element.get("name"),
        documentation=_documentation(element),
        bounds=di.bounds.get(node_id),
        attached_to=element.get("attachedToRef"),
        cancel_activity=_optional_bool(element.get("cancelActivity")),
        is_expanded=(di.expanded.get(node_id) if node_type is NodeType.SUB_PROCESS else None),
        implementation=element.get("implementation"),
        script_format=element.get("scriptFormat"),
        script=script.text if script is not None and script.text else None,
        default_flow=element.get("default"),
        timer=_parse_timer(element),
        error_ref=_parse_error_ref(element),
    )
    if node_type is NodeType.SUB_PROCESS:
        node.nodes, node.flows = _parse_inner(element, di)
    return node


def _parse_timer(element: etree._Element) -> TimerDefinition | None:
    """Достаёт `timeDuration`/`timeDate`/`timeCycle` из timerEventDefinition."""
    definition = element.find(q(BPMN, "timerEventDefinition"))
    if definition is None:
        return None
    for child in definition:
        local = etree.QName(child).localname
        text = child.text.strip() if child.text else ""
        if local in _TIMER_KINDS and text:
            return TimerDefinition(kind=_TIMER_KINDS[local], expression=text)
    return None


def _parse_error_ref(element: etree._Element) -> str | None:
    """Ссылка `errorRef` из errorEventDefinition."""
    definition = element.find(q(BPMN, "errorEventDefinition"))
    if definition is None:
        return None
    return definition.get("errorRef")


def _parse_flow(element: etree._Element, flow_type: FlowType, di: _DiIndex) -> Flow:
    flow_id = element.get("id")
    source = element.get("sourceRef")
    target = element.get("targetRef")
    if not flow_id or not source or not target:
        raise BpmnModelError(
            f"у связи {flow_type.value} должны быть id, sourceRef и targetRef",
            line=_line(element),
        )
    condition = element.find(q(BPMN, "conditionExpression"))
    return Flow(
        id=flow_id,
        type=flow_type,
        name=element.get("name"),
        documentation=_documentation(element),
        source_ref=source,
        target_ref=target,
        condition=condition.text.strip() if condition is not None and condition.text else None,
        waypoints=di.waypoints.get(flow_id, []),
    )


def _parse_artifact(element: etree._Element, artifact_type: ArtifactType, di: _DiIndex) -> Artifact:
    artifact_id = element.get("id")
    if not artifact_id:
        raise BpmnModelError(f"у артефакта {artifact_type.value} нет id", line=_line(element))
    text_el = element.find(q(BPMN, "text"))
    return Artifact(
        id=artifact_id,
        type=artifact_type,
        name=element.get("name"),
        documentation=_documentation(element),
        bounds=di.bounds.get(artifact_id),
        text=text_el.text if text_el is not None and text_el.text else None,
        category_value_ref=element.get("categoryValueRef"),
    )


def _parse_collaboration(element: etree._Element, di: _DiDocument) -> Collaboration:
    collaboration_id = element.get("id") or "Collaboration_1"
    plane_index = di.index_for(collaboration_id)
    participants = [
        Participant(
            id=participant.get("id") or "Participant_1",
            name=participant.get("name"),
            process_ref=participant.get("processRef"),
            bounds=plane_index.bounds.get(participant.get("id") or ""),
        )
        for participant in element.findall(q(BPMN, "participant"))
    ]
    message_flows = [
        _parse_flow(flow, FlowType.MESSAGE, plane_index)
        for flow in element.findall(q(BPMN, "messageFlow"))
    ]
    plane = di.planes.get(collaboration_id)
    return Collaboration(
        id=collaboration_id,
        participants=participants,
        message_flows=message_flows,
        plane_id=plane[1] if plane else None,
        diagram_id=plane[0] if plane else None,
    )


def _documentation(element: etree._Element) -> str | None:
    documentation = element.find(q(BPMN, "documentation"))
    if documentation is None or not documentation.text:
        return None
    return documentation.text.strip()


def _float(element: etree._Element, attribute: str) -> float:
    raw = element.get(attribute)
    if raw is None:
        msg = f"у {etree.QName(element).localname} нет атрибута {attribute}"
        raise BpmnModelError(msg, line=_line(element))
    try:
        return float(raw)
    except ValueError as exc:
        raise BpmnModelError(
            f"атрибут {attribute} должен быть числом, получено {raw!r}",
            line=_line(element),
        ) from exc


def _optional_bool(raw: str | None) -> bool | None:
    if raw is None:
        return None
    return raw == "true"


def _line(element: etree._Element) -> int | None:
    # В stubs lxml `sourceline` не аннотирован, поэтому проверяем тип сами.
    line: object = element.sourceline
    return line if isinstance(line, int) else None


def _column(element: etree._Element) -> int | None:
    return None
