"""Движок валидации: один граф, один проход по правилам, стабильный отчёт (2.1.2)."""

from __future__ import annotations

import time
from collections.abc import Mapping
from dataclasses import dataclass, field

import networkx as nx

from app.bpmn.model import BpmnDocument, Flow, Node, Process
from app.schemas.validation import Finding, Severity, ValidationReport
from app.validation.rules import (
    Rule,
    RuleCategory,
    RuleContext,
    RuleRegistry,
    default_registry,
)

_SEVERITY_ORDER: dict[Severity, int] = {"error": 0, "warning": 1, "info": 2}


@dataclass(frozen=True, slots=True)
class EngineOptions:
    """Ограничения одного прогона; конфиг правил появится в 2.1.5."""

    categories: frozenset[RuleCategory] | None = None
    disabled_rule_ids: frozenset[str] = frozenset()
    severity_overrides: Mapping[str, Severity] = field(default_factory=dict)


def _process_graph(process: Process) -> nx.DiGraph[str]:
    graph: nx.DiGraph[str] = nx.DiGraph()
    graph.add_nodes_from(node.id for node in process.nodes)
    for flow in process.flows:
        graph.add_edge(flow.source_ref, flow.target_ref, flow_id=flow.id)
    return graph


def build_graph(document: BpmnDocument) -> nx.DiGraph[str]:
    """Строит общий граф последовательных потоков один раз на весь прогон.

    Узлы — все элементы процессов, включая изолированные: правила структуры
    должны видеть и их. MessageFlow сюда не входят, это межпуловые связи.
    """
    graph: nx.DiGraph[str] = nx.DiGraph()
    for process in document.processes:
        process_graph = _process_graph(process)
        graph.add_nodes_from(process_graph.nodes)
        for source, target, data in process_graph.edges(data=True):
            graph.add_edge(source, target, **data)
    return graph


def build_context(document: BpmnDocument) -> RuleContext:
    """Индексы по id и графы процессов для правил."""
    processes: dict[str, Process] = {process.id: process for process in document.processes}
    nodes: dict[str, Node] = {}
    flows: dict[str, Flow] = {}
    graphs: dict[str, nx.DiGraph[str]] = {}
    for process in document.processes:
        graphs[process.id] = _process_graph(process)
        for node in process.nodes:
            nodes[node.id] = node
        for flow in process.flows:
            flows[flow.id] = flow
    return RuleContext(
        document=document,
        graph=build_graph(document),
        graphs=graphs,
        processes=processes,
        nodes_by_id=nodes,
        flows_by_id=flows,
    )


class ValidationEngine:
    """Запускает выбранные правила и собирает `ValidationReport`."""

    def __init__(
        self,
        registry: RuleRegistry | None = None,
        *,
        options: EngineOptions | None = None,
    ) -> None:
        self.registry = registry if registry is not None else default_registry
        self.options = options or EngineOptions()

    def validate(
        self,
        document: BpmnDocument,
        *,
        options: EngineOptions | None = None,
    ) -> ValidationReport:
        started = time.perf_counter()
        actual = options or self.options
        context = build_context(document)
        findings: list[Finding] = []
        seen: set[tuple[str, str | None, str | None, int | None, int | None, str]] = set()

        for rule in self.registry.select(
            categories=actual.categories,
            disabled_rule_ids=actual.disabled_rule_ids,
        ):
            for finding in self._run_rule(rule, context):
                key = (
                    finding.rule_id,
                    finding.element_id,
                    finding.element_name,
                    finding.line,
                    finding.column,
                    finding.message,
                )
                if key in seen:
                    continue
                seen.add(key)
                findings.append(
                    self._with_severity(finding, actual.severity_overrides.get(rule.rule_id))
                )

        findings.sort(key=_finding_order)
        duration_ms = (time.perf_counter() - started) * 1000
        return ValidationReport.from_findings(findings, duration_ms=duration_ms)

    @staticmethod
    def _run_rule(rule: Rule, context: RuleContext) -> list[Finding]:
        findings = list(rule.check(context))
        for finding in findings:
            if finding.rule_id != rule.rule_id:
                msg = f"правило {rule.rule_id} вернуло finding с чужим кодом {finding.rule_id}"
                raise ValueError(msg)
        return findings

    @staticmethod
    def _with_severity(finding: Finding, severity: Severity | None) -> Finding:
        if severity is None or finding.severity == severity:
            return finding
        return finding.model_copy(update={"severity": severity})


def _finding_order(finding: Finding) -> tuple[int, str, str, int, int, str]:
    """Детерминированный порядок: severity → element_id → rule_id → место."""
    return (
        _SEVERITY_ORDER[finding.severity],
        finding.element_id or "",
        finding.rule_id,
        finding.line or 0,
        finding.column or 0,
        finding.message,
    )


__all__ = [
    "EngineOptions",
    "ValidationEngine",
    "build_context",
    "build_graph",
]
