"""Правила шлюзов и событий — задача 2.1.4.

Правила не исполняют условия и не меняют документ: проверяются только тип
элемента, исходящие потоки, `default` и `attachedToRef`. Условие считается
заданным, если у sequenceFlow есть непустой `conditionExpression`.
"""

from __future__ import annotations

from app.bpmn.model import Flow, Node, NodeType
from app.schemas.validation import Finding, Severity
from app.validation.rules import RuleContext, default_registry

_SPLIT_GATEWAYS = {
    NodeType.EXCLUSIVE_GATEWAY,
    NodeType.INCLUSIVE_GATEWAY,
}
#: Типы, которые событийный шлюз вправе ждать на выходе.
_EVENT_GATEWAY_TARGETS = {
    NodeType.INTERMEDIATE_CATCH_EVENT,
}
_ACTIVITY_TYPES = {
    NodeType.TASK,
    NodeType.USER_TASK,
    NodeType.SERVICE_TASK,
    NodeType.SCRIPT_TASK,
    NodeType.MANUAL_TASK,
    NodeType.SUB_PROCESS,
}


def _finding(
    rule_id: str,
    message: str,
    *,
    element_id: str | None,
    element_name: str | None,
    hint: str | None = None,
    severity: Severity = "error",
) -> Finding:
    return Finding(
        rule_id=rule_id,
        severity=severity,
        message=message,
        element_id=element_id,
        element_name=element_name,
        hint=hint,
    )


def _labelled(node: Node) -> str:
    return f"«{node.name or node.id}»"


def _outgoing_flows(context: RuleContext, node: Node) -> list[Flow]:
    graph = context.graph_for(_process_id(context, node))
    flows: list[Flow] = []
    for _, _, data in graph.out_edges(node.id, data=True):
        flow = context.flows_by_id.get(data.get("flow_id", ""))
        if flow is not None:
            flows.append(flow)
    return flows


def _process_id(context: RuleContext, node: Node) -> str:
    for process in context.document.processes:
        if any(item.id == node.id for item in process.nodes):
            return process.id
    return ""


@default_registry.rule("BPMN-GATEWAY-001", category="gateway")
def gateway_branch_without_condition(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if node.type not in _SPLIT_GATEWAYS:
            continue
        flows = _outgoing_flows(context, node)
        if len(flows) < 2:
            continue
        for flow in flows:
            if flow.id == node.default_flow or flow.condition:
                continue
            findings.append(
                _finding(
                    "BPMN-GATEWAY-001",
                    f"ветка {_labelled(node)} без условия",
                    element_id=flow.id,
                    element_name=flow.name,
                    hint="добавьте conditionExpression или назначьте поток по умолчанию",
                )
            )
    return findings


@default_registry.rule("BPMN-GATEWAY-002", category="gateway", severity="warning")
def gateway_without_default(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if node.type not in _SPLIT_GATEWAYS:
            continue
        if len(_outgoing_flows(context, node)) < 2 or node.default_flow:
            continue
        findings.append(
            _finding(
                "BPMN-GATEWAY-002",
                f"у шлюза {_labelled(node)} нет потока по умолчанию",
                element_id=node.id,
                element_name=node.name,
                hint="без default-потока процесс может остановиться, если условия не совпали",
                severity="warning",
            )
        )
    return findings


@default_registry.rule("BPMN-GATEWAY-003", category="gateway")
def default_flow_with_condition(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if not node.default_flow:
            continue
        flow = context.flows_by_id.get(node.default_flow)
        if flow is None or not flow.condition:
            continue
        findings.append(
            _finding(
                "BPMN-GATEWAY-003",
                f"поток по умолчанию {_labelled(node)} имеет условие",
                element_id=flow.id,
                element_name=flow.name,
                hint="default-поток срабатывает без условия — уберите условие",
            )
        )
    return findings


@default_registry.rule("BPMN-GATEWAY-004", category="gateway")
def default_flow_not_outgoing(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if not node.default_flow:
            continue
        outgoing = {flow.id for flow in _outgoing_flows(context, node)}
        if node.default_flow in outgoing:
            continue
        target = context.flows_by_id.get(node.default_flow)
        message = (
            f"default у {_labelled(node)} ссылается на отсутствующий поток"
            if target is None
            else f"default у {_labelled(node)} ссылается на поток, который из него не выходит"
        )
        findings.append(
            _finding(
                "BPMN-GATEWAY-004",
                message,
                element_id=node.id,
                element_name=node.name,
                hint="укажите default на один из исходящих sequenceFlow",
            )
        )
    return findings


@default_registry.rule("BPMN-GATEWAY-005", category="gateway", severity="warning")
def gateway_splits_and_merges(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if not node.type.value.endswith("Gateway"):
            continue
        graph = context.graph_for(_process_id(context, node))
        if graph.in_degree(node.id) > 1 and graph.out_degree(node.id) > 1:
            findings.append(
                _finding(
                    "BPMN-GATEWAY-005",
                    f"шлюз {_labelled(node)} одновременно сливает и разделяет потоки",
                    element_id=node.id,
                    element_name=node.name,
                    hint="разделите слияние и ветвление на два шлюза — так поведение однозначно",
                    severity="warning",
                )
            )
    return findings


@default_registry.rule("BPMN-GATEWAY-006", category="gateway")
def event_gateway_targets(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if node.type is not NodeType.EVENT_BASED_GATEWAY:
            continue
        graph = context.graph_for(_process_id(context, node))
        for target_id in graph.successors(node.id):
            target = context.node(target_id)
            if target is None or target.type in _EVENT_GATEWAY_TARGETS:
                continue
            findings.append(
                _finding(
                    "BPMN-GATEWAY-006",
                    f"событийный шлюз {_labelled(node)} ведёт в {_labelled(target)}",
                    element_id=node.id,
                    element_name=node.name,
                    hint="после событийного шлюза допустимы только ожидающие события",
                )
            )
    return findings


@default_registry.rule("BPMN-EVENT-001", category="event")
def boundary_event_missing_attachment(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if node.type is not NodeType.BOUNDARY_EVENT or not node.attached_to:
            continue
        if context.node(node.attached_to) is None:
            findings.append(
                _finding(
                    "BPMN-EVENT-001",
                    f"граничное событие {_labelled(node)} прикреплено к отсутствующему элементу",
                    element_id=node.id,
                    element_name=node.name,
                    hint=f"attachedToRef={node.attached_to} не найден в процессе",
                )
            )
    return findings


@default_registry.rule("BPMN-EVENT-002", category="event")
def start_event_without_outgoing(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if node.type is not NodeType.START_EVENT:
            continue
        graph = context.graph_for(_process_id(context, node))
        if graph.out_degree(node.id) == 0:
            findings.append(
                _finding(
                    "BPMN-EVENT-002",
                    f"стартовое событие {_labelled(node)} без исходящего потока",
                    element_id=node.id,
                    element_name=node.name,
                    hint="проведите sequenceFlow к первому действию процесса",
                )
            )
    return findings


@default_registry.rule("BPMN-EVENT-003", category="event")
def end_event_with_outgoing(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if node.type is not NodeType.END_EVENT:
            continue
        graph = context.graph_for(_process_id(context, node))
        if graph.out_degree(node.id) > 0:
            findings.append(
                _finding(
                    "BPMN-EVENT-003",
                    f"завершающее событие {_labelled(node)} имеет исходящий поток",
                    element_id=node.id,
                    element_name=node.name,
                    hint="из endEvent нельзя продолжать процесс — удалите исходящий flow",
                )
            )
    return findings


@default_registry.rule("BPMN-EVENT-004", category="event", severity="warning")
def boundary_event_on_non_activity(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for node in context.nodes_by_id.values():
        if node.type is not NodeType.BOUNDARY_EVENT or not node.attached_to:
            continue
        target = context.node(node.attached_to)
        if target is None or target.type in _ACTIVITY_TYPES:
            continue
        findings.append(
            _finding(
                "BPMN-EVENT-004",
                f"граничное событие {_labelled(node)} прикреплено к {_labelled(target)}",
                element_id=node.id,
                element_name=node.name,
                hint="граничное событие допустимо только на задаче или подпроцессе",
                severity="warning",
            )
        )
    return findings


__all__ = [
    "boundary_event_missing_attachment",
    "boundary_event_on_non_activity",
    "default_flow_not_outgoing",
    "default_flow_with_condition",
    "end_event_with_outgoing",
    "event_gateway_targets",
    "gateway_branch_without_condition",
    "gateway_splits_and_merges",
    "gateway_without_default",
    "start_event_without_outgoing",
]
