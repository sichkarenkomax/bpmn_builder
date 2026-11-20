"""Реестр правил валидации и общий контекст одного прогона (2.1.2)."""

from __future__ import annotations

import re
from collections.abc import Callable, Collection, Iterable, Mapping
from dataclasses import dataclass
from typing import Literal

import networkx as nx

from app.bpmn.model import BpmnDocument, Flow, Node, Process
from app.schemas.validation import RULE_ID_PATTERN, Finding, Severity

RuleCategory = Literal["structure", "gateway", "event", "lane"]

RuleCheck = Callable[["RuleContext"], Iterable[Finding]]


@dataclass(frozen=True, slots=True)
class RuleContext:
    """Всё, что нужно правилам: документ, граф и индексы по id.

    Документ и граф строятся один раз на прогон; правила не парсят XML и не
    ходят в БД. Индексы нужны для перехода от `element_id` finding'а к фигуре.
    """

    document: BpmnDocument
    graph: nx.DiGraph[str]
    graphs: Mapping[str, nx.DiGraph[str]]
    processes: Mapping[str, Process]
    nodes_by_id: Mapping[str, Node]
    flows_by_id: Mapping[str, Flow]

    def node(self, element_id: str | None) -> Node | None:
        if element_id is None:
            return None
        return self.nodes_by_id.get(element_id)

    def process(self, process_id: str) -> Process | None:
        return self.processes.get(process_id)

    def graph_for(self, process_id: str) -> nx.DiGraph[str]:
        """Граф одного процесса: sequenceFlow не может пересекать границы процесса."""
        return self.graphs.get(process_id, nx.DiGraph())


@dataclass(frozen=True, slots=True)
class Rule:
    """Одно правило с неизменным кодом и категорией."""

    rule_id: str
    category: RuleCategory
    default_severity: Severity
    check: RuleCheck

    def __post_init__(self) -> None:
        if re.fullmatch(RULE_ID_PATTERN, self.rule_id) is None:
            msg = f"некорректный код правила: {self.rule_id!r}"
            raise ValueError(msg)


class RuleRegistry:
    """Реестр без глобального состояния внутри движка.

    У приложения есть `default_registry`, а тесты и будущий конфиг могут собрать
    собственный реестр. Повторная регистрация кода запрещена: иначе CI и UI
    получат разные правила под одним и тем же `rule_id`.
    """

    def __init__(self) -> None:
        self._rules: dict[str, Rule] = {}

    def register(self, rule: Rule) -> Rule:
        if rule.rule_id in self._rules:
            msg = f"правило уже зарегистрировано: {rule.rule_id}"
            raise ValueError(msg)
        self._rules[rule.rule_id] = rule
        return rule

    def rule(
        self,
        rule_id: str,
        *,
        category: RuleCategory,
        severity: Severity = "error",
    ) -> Callable[[RuleCheck], RuleCheck]:
        """Декоратор: `@registry.rule("BPMN-STRUCT-001", category="structure")`."""

        def decorator(check: RuleCheck) -> RuleCheck:
            self.register(
                Rule(
                    rule_id=rule_id,
                    category=category,
                    default_severity=severity,
                    check=check,
                )
            )
            return check

        return decorator

    def get(self, rule_id: str) -> Rule | None:
        return self._rules.get(rule_id)

    def all(self) -> tuple[Rule, ...]:
        return tuple(self._rules.values())

    def select(
        self,
        *,
        categories: Collection[RuleCategory] | None = None,
        disabled_rule_ids: Collection[str] = (),
    ) -> tuple[Rule, ...]:
        """Выбирает правила, сохраняя порядок регистрации; сортировка — в движке."""
        disabled = set(disabled_rule_ids)
        return tuple(
            rule
            for rule in self._rules.values()
            if rule.rule_id not in disabled and (categories is None or rule.category in categories)
        )


default_registry = RuleRegistry()


__all__ = [
    "Rule",
    "RuleCategory",
    "RuleCheck",
    "RuleContext",
    "RuleRegistry",
    "default_registry",
]
