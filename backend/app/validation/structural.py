"""Структурные правила BPMN — задача 2.1.3.

Правила работают только с моделью и графом: не меняют документ, не ходят в БД
и не исполняют выражения. Каждый finding ссылается на элемент, чтобы панель
проблем могла к нему перейти.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable

import networkx as nx

from app.bpmn.model import BpmnDocument, Lane, NodeType
from app.schemas.validation import Finding, Severity
from app.validation.rules import RuleContext, default_registry


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


def _flatten_lanes(lanes: Iterable[Lane]) -> list[Lane]:
    result: list[Lane] = []
    for lane in lanes:
        result.append(lane)
        result.extend(_flatten_lanes(lane.child_lanes))
    return result


def _all_ids(document: BpmnDocument) -> list[tuple[str, str | None]]:
    """Пары (id, имя) для проверки глобальной уникальности BPMN id."""
    items: list[tuple[str, str | None]] = []
    for process in document.processes:
        items.append((process.id, process.name))
        items.extend((node.id, node.name) for node in process.nodes)
        items.extend((flow.id, flow.name) for flow in process.flows)
        items.extend((artifact.id, artifact.name) for artifact in process.artifacts)
        items.extend((lane.id, lane.name) for lane in _flatten_lanes(process.lanes))
    collaboration = document.collaboration
    if collaboration is not None:
        items.append((collaboration.id, None))
        items.extend(
            (participant.id, participant.name) for participant in collaboration.participants
        )
    return items


@default_registry.rule("BPMN-STRUCT-001", category="structure")
def missing_start(context: RuleContext) -> list[Finding]:
    return [
        _finding(
            "BPMN-STRUCT-001",
            "в процессе нет стартового события",
            element_id=process.id,
            element_name=process.name,
            hint="добавьте startEvent, иначе процесс не с чего начать",
        )
        for process in context.document.processes
        if not any(node.type is NodeType.START_EVENT for node in process.nodes)
    ]


@default_registry.rule("BPMN-STRUCT-002", category="structure")
def missing_end(context: RuleContext) -> list[Finding]:
    return [
        _finding(
            "BPMN-STRUCT-002",
            "в процессе нет завершающего события",
            element_id=process.id,
            element_name=process.name,
            hint="добавьте endEvent, иначе у процесса нет результата",
        )
        for process in context.document.processes
        if not any(node.type is NodeType.END_EVENT for node in process.nodes)
    ]


@default_registry.rule("BPMN-STRUCT-003", category="structure")
def unreachable_nodes(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for process in context.document.processes:
        starts = [node.id for node in process.nodes if node.type is NodeType.START_EVENT]
        if not starts:
            # Без старта недостижимы все; это уже отдельная ошибка 001, не дублируем.
            continue
        graph = context.graph_for(process.id)
        reachable = set(starts)
        for start in starts:
            reachable.update(nx.descendants(graph, start))
        for node in process.nodes:
            if node.type is NodeType.START_EVENT or node.id in reachable:
                continue
            findings.append(
                _finding(
                    "BPMN-STRUCT-003",
                    f"элемент «{node.name or node.id}» недостижим из стартового события",
                    element_id=node.id,
                    element_name=node.name,
                    hint="соедините элемент последовательным потоком с процессом",
                )
            )
    return findings


@default_registry.rule("BPMN-STRUCT-004", category="structure")
def dead_ends(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for process in context.document.processes:
        graph = context.graph_for(process.id)
        for node in process.nodes:
            # Старт без исходящего потока — отдельное правило 2.1.4.
            if node.type in (NodeType.END_EVENT, NodeType.START_EVENT):
                continue
            if graph.out_degree(node.id) == 0:
                findings.append(
                    _finding(
                        "BPMN-STRUCT-004",
                        f"элемент «{node.name or node.id}» не имеет исходящего потока",
                        element_id=node.id,
                        element_name=node.name,
                        hint="добавьте sequenceFlow или завершающее событие",
                    )
                )
    return findings


@default_registry.rule("BPMN-STRUCT-005", category="structure")
def dangling_flows(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for process in context.document.processes:
        node_ids = process.node_ids()
        for flow in process.flows:
            missing = [ref for ref in (flow.source_ref, flow.target_ref) if ref not in node_ids]
            if not missing:
                continue
            findings.append(
                _finding(
                    "BPMN-STRUCT-005",
                    f"связь «{flow.name or flow.id}» ссылается на отсутствующий элемент: "
                    + ", ".join(sorted(set(missing))),
                    element_id=flow.id,
                    element_name=flow.name,
                    hint="исправьте sourceRef/targetRef или удалите связь",
                )
            )
    return findings


@default_registry.rule("BPMN-STRUCT-006", category="structure")
def duplicate_ids(context: RuleContext) -> list[Finding]:
    items = _all_ids(context.document)
    counts = Counter(element_id for element_id, _ in items)
    names = {element_id: name for element_id, name in items}
    return [
        _finding(
            "BPMN-STRUCT-006",
            f"идентификатор «{element_id}» встречается {count} раз",
            element_id=element_id,
            element_name=names.get(element_id),
            hint="в BPMN id должны быть уникальны в пределах definitions",
        )
        for element_id, count in sorted(counts.items())
        if count > 1
    ]


@default_registry.rule("BPMN-STRUCT-007", category="structure")
def participants_without_process(context: RuleContext) -> list[Finding]:
    collaboration = context.document.collaboration
    if collaboration is None:
        return []
    process_ids = {process.id for process in context.document.processes}
    findings: list[Finding] = []
    for participant in collaboration.participants:
        if participant.process_ref in process_ids:
            continue
        if participant.process_ref is None:
            message = f"пул «{participant.name or participant.id}» не ссылается на процесс"
        else:
            message = (
                f"пул «{participant.name or participant.id}» ссылается на отсутствующий "
                f"процесс {participant.process_ref}"
            )
        findings.append(
            _finding(
                "BPMN-STRUCT-007",
                message,
                element_id=participant.id,
                element_name=participant.name,
                hint="укажите processRef на существующий bpmn:process",
            )
        )
    return findings


@default_registry.rule("BPMN-STRUCT-008", category="structure")
def nodes_outside_lanes(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for process in context.document.processes:
        lanes = _flatten_lanes(process.lanes)
        if not lanes:
            continue
        assigned = {ref for lane in lanes for ref in lane.flow_node_refs}
        for node in process.nodes:
            if node.id in assigned:
                continue
            findings.append(
                _finding(
                    "BPMN-STRUCT-008",
                    f"элемент «{node.name or node.id}» не входит ни в одну дорожку",
                    element_id=node.id,
                    element_name=node.name,
                    hint="добавьте id элемента в flowNodeRef дорожки",
                    severity="warning",
                )
            )
    return findings


@default_registry.rule("BPMN-STRUCT-009", category="structure")
def empty_leaf_lanes(context: RuleContext) -> list[Finding]:
    findings: list[Finding] = []
    for process in context.document.processes:
        for lane in _flatten_lanes(process.lanes):
            if lane.child_lanes or lane.flow_node_refs:
                continue
            findings.append(
                _finding(
                    "BPMN-STRUCT-009",
                    f"дорожка «{lane.name or lane.id}» не содержит flowNodeRef",
                    element_id=lane.id,
                    element_name=lane.name,
                    hint="добавьте элементы в дорожку или удалите её",
                    severity="warning",
                )
            )
    return findings


__all__ = [
    "dangling_flows",
    "dead_ends",
    "duplicate_ids",
    "empty_leaf_lanes",
    "missing_end",
    "missing_start",
    "nodes_outside_lanes",
    "participants_without_process",
    "unreachable_nodes",
]
