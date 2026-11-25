"""Конфиг правил валидации и пользовательские правила — задачи 2.1.5 и 2.4.1.

Конфиг — только данные: включение/выключение, severity и декларативные правила
с параметрами. Произвольный код и выражения не принимаются. Ошибки конфига не
ломают проверку схемы: они возвращаются в `ValidationReport.config_errors`,
а неизвестный код правила становится предупреждением конфига.

Пример `validation-rules.json`:

```json
{
  "rules": {
    "BPMN-STRUCT-009": {"enabled": false},
    "BPMN-STRUCT-008": {"severity": "info"}
  },
  "disabled_rules": ["BPMN-STRUCT-007"],
  "custom_rules": [
    {"id": "BPMN-CUSTOM-001", "kind": "max_elements", "max": 50},
    {"id": "BPMN-CUSTOM-002", "kind": "required_attribute",
     "attribute": "documentation", "node_types": ["userTask"]}
  ]
}
```
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.bpmn.model import Node, NodeType
from app.schemas.validation import RULE_ID_PATTERN, Finding, Severity
from app.validation.engine import EngineOptions, ValidationEngine
from app.validation.rules import (
    Rule,
    RuleCategory,
    RuleContext,
    RuleRegistry,
    default_registry,
)

CustomKind = Literal[
    "max_elements",
    "max_outgoing_flows",
    "required_attribute",
    "forbidden_node_type",
    "required_node_type",
]


class RuleOverride(BaseModel):
    """Настройка одного встроенного правила."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    severity: Severity | None = None


class CustomRuleConfig(BaseModel):
    """Декларативное пользовательское правило."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=RULE_ID_PATTERN, max_length=64)
    kind: CustomKind
    severity: Severity = "warning"
    enabled: bool = True
    max: int | None = Field(default=None, ge=1, le=10000)
    node_types: list[NodeType] = Field(default_factory=list)
    attribute: Literal["name", "documentation"] = "name"
    node_type: NodeType | None = None

    @model_validator(mode="after")
    def _params_match_kind(self) -> Self:
        if self.kind in {"max_elements", "max_outgoing_flows"} and self.max is None:
            raise ValueError(f"для {self.kind} нужен параметр max")
        if self.kind == "required_attribute" and not self.node_types:
            raise ValueError("для required_attribute нужен хотя бы один node_type")
        if self.kind in {"forbidden_node_type", "required_node_type"} and self.node_type is None:
            raise ValueError(f"для {self.kind} нужен node_type")
        return self


class RuleConfigFile(BaseModel):
    """Формат файла конфига; неизвестные ключи — ошибка, а не молчание."""

    model_config = ConfigDict(extra="forbid")

    rules: dict[str, RuleOverride] = Field(default_factory=dict)
    disabled_rules: list[str] = Field(default_factory=list)
    custom_rules: list[CustomRuleConfig] = Field(default_factory=list)


@dataclass(frozen=True, slots=True)
class RuleConfig:
    """Разобранный конфиг: рабочие настройки и отдельный список ошибок."""

    disabled: frozenset[str] = frozenset()
    overrides: Mapping[str, Severity] = field(default_factory=dict)
    custom_rules: tuple[CustomRuleConfig, ...] = ()
    errors: tuple[str, ...] = ()


def parse_rule_config(data: object | None) -> RuleConfig:
    """Разбирает JSON-совместимые данные; никогда не бросает наружу."""
    if data is None:
        return RuleConfig()
    try:
        parsed = RuleConfigFile.model_validate(data)
    except ValidationError as exc:
        details = "; ".join(
            f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in exc.errors()
        )
        return RuleConfig(errors=(f"конфиг правил не принят: {details}",))

    errors: list[str] = []
    disabled = set(parsed.disabled_rules)
    overrides: dict[str, Severity] = {}
    for rule_id, override in parsed.rules.items():
        if default_registry.get(rule_id) is None:
            errors.append(f"неизвестный код правила в конфиге: {rule_id}")
            continue
        if not override.enabled:
            disabled.add(rule_id)
        if override.severity is not None:
            overrides[rule_id] = override.severity
    for rule_id in parsed.disabled_rules:
        if default_registry.get(rule_id) is None:
            errors.append(f"неизвестный код правила в disabled_rules: {rule_id}")

    seen: set[str] = set()
    custom: list[CustomRuleConfig] = []
    for rule in parsed.custom_rules:
        if rule.id in seen:
            errors.append(f"повторяющийся id пользовательского правила: {rule.id}")
            continue
        if default_registry.get(rule.id) is not None:
            errors.append(f"пользовательское правило {rule.id} перекрывает встроенное")
            continue
        seen.add(rule.id)
        custom.append(rule)

    return RuleConfig(
        disabled=frozenset(disabled),
        overrides=overrides,
        custom_rules=tuple(custom),
        errors=tuple(errors),
    )


def load_rule_config(path: str | Path | None) -> RuleConfig:
    """Читает файл конфига; отсутствие файла — не ошибка, битый файл — ошибка."""
    if path is None or str(path).strip() == "":
        return RuleConfig()
    try:
        raw = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        return RuleConfig(errors=(f"не удалось прочитать конфиг правил {path}: {exc}",))
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return RuleConfig(errors=(f"конфиг правил {path} — не JSON: {exc}",))
    return parse_rule_config(data)


def _custom_finding(
    rule: CustomRuleConfig,
    message: str,
    *,
    element_id: str | None,
    element_name: str | None,
    hint: str | None = None,
) -> Finding:
    return Finding(
        rule_id=rule.id,
        severity=rule.severity,
        message=message,
        element_id=element_id,
        element_name=element_name,
        hint=hint,
    )


def _node_label(node: Node) -> str:
    return f"«{node.name or node.id}»"


def _check_max_elements(rule: CustomRuleConfig, context: RuleContext) -> Iterable[Finding]:
    assert rule.max is not None
    for process in context.document.processes:
        if len(process.nodes) > rule.max:
            yield _custom_finding(
                rule,
                f"в процессе {len(process.nodes)} элементов при лимите {rule.max}",
                element_id=process.id,
                element_name=process.name,
                hint="разделите процесс или поднимите лимит в конфиге правил",
            )


def _check_max_outgoing(rule: CustomRuleConfig, context: RuleContext) -> Iterable[Finding]:
    assert rule.max is not None
    for process in context.document.processes:
        graph = context.graph_for(process.id)
        for node in process.nodes:
            if graph.out_degree(node.id) > rule.max:
                yield _custom_finding(
                    rule,
                    f"у элемента {_node_label(node)} больше {rule.max} исходящих потоков",
                    element_id=node.id,
                    element_name=node.name,
                    hint="упростите ветвление или поднимите лимит",
                )


def _check_required_attribute(rule: CustomRuleConfig, context: RuleContext) -> Iterable[Finding]:
    types = set(rule.node_types)
    for process in context.document.processes:
        for node in process.nodes:
            if node.type not in types:
                continue
            value = node.name if rule.attribute == "name" else node.documentation
            if value and value.strip():
                continue
            label = "имя" if rule.attribute == "name" else "документация"
            yield _custom_finding(
                rule,
                f"у элемента {_node_label(node)} не задано {label}",
                element_id=node.id,
                element_name=node.name,
                hint=f"заполните {rule.attribute} в инспекторе свойств",
            )


def _check_forbidden_type(rule: CustomRuleConfig, context: RuleContext) -> Iterable[Finding]:
    assert rule.node_type is not None
    for process in context.document.processes:
        for node in process.nodes:
            if node.type is rule.node_type:
                yield _custom_finding(
                    rule,
                    f"элемент {_node_label(node)} типа {rule.node_type.value} запрещён конфигом",
                    element_id=node.id,
                    element_name=node.name,
                    hint="замените тип элемента или отключите правило",
                )


def _check_required_type(rule: CustomRuleConfig, context: RuleContext) -> Iterable[Finding]:
    assert rule.node_type is not None
    for process in context.document.processes:
        if not process.nodes or any(node.type is rule.node_type for node in process.nodes):
            continue
        yield _custom_finding(
            rule,
            f"в процессе нет элемента типа {rule.node_type.value}",
            element_id=process.id,
            element_name=process.name,
            hint="добавьте обязательный элемент или отключите правило",
        )


_CHECKERS = {
    "max_elements": _check_max_elements,
    "max_outgoing_flows": _check_max_outgoing,
    "required_attribute": _check_required_attribute,
    "forbidden_node_type": _check_forbidden_type,
    "required_node_type": _check_required_type,
}


def build_registry(config: RuleConfig) -> RuleRegistry:
    """Копия встроенного реестра плюс пользовательские правила из конфига."""
    registry = default_registry.copy()
    for rule in config.custom_rules:
        if not rule.enabled:
            continue
        checker = _CHECKERS[rule.kind]

        def check(
            context: RuleContext,
            *,
            _rule: CustomRuleConfig = rule,
            _checker: object = checker,
        ) -> Iterable[Finding]:
            assert callable(_checker)
            return list(_checker(_rule, context))

        registry.register(
            Rule(
                rule_id=rule.id,
                category="structure",
                default_severity=rule.severity,
                check=check,
            )
        )
    return registry


def build_engine(
    config: RuleConfig, *, categories: frozenset[RuleCategory] | None = None
) -> ValidationEngine:
    """Собирает движок из конфига; ошибки конфига отдаются отдельно в отчёте."""
    registry = build_registry(config)
    return ValidationEngine(
        registry,
        options=EngineOptions(
            categories=categories,
            disabled_rule_ids=config.disabled,
            severity_overrides=config.overrides,
        ),
    )


__all__ = [
    "CustomRuleConfig",
    "RuleConfig",
    "RuleConfigFile",
    "RuleOverride",
    "build_engine",
    "build_registry",
    "load_rule_config",
    "parse_rule_config",
]
