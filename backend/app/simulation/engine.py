"""Симуляция токена по BPMN-схеме — первый срез этапа 3.

Движок детерминированно проводит токены по последовательным потокам:
стартовые/конечные события, задачи, эксклюзивные, параллельные и инклюзивные
шлюзы. Условия на потоках вычисляются безопасным `evaluate_condition`, без
`eval`. Если условие не задано, ссылается на неизвестную переменную или ни одна
ветка не подошла, прогон останавливается с `decision`: ветку выбирает
пользователь, а повторный запуск получает выбор в `choices`. Таймер события
даёт шаг `waiting` с `wait_ms` (для `timeDuration`), остальные промежуточные
события считаются «ручным шагом» — токен проходит дальше; скрипт-задача
исполняет безопасные присваивания `имя = выражение`, а каждый шаг несёт снимок
переменных после себя.

Подпроцессы: свёрнутый проходит одним шагом и не раскрывается в журнале,
раскрытый (`isExpanded`) входит через внутренние стартовые события и выходит
через внутренние концы на исходящие потоки подпроцесса; вложенность любой
глубины, внутренние узлы видны в журнале и счётчиках, переменные общие.
Граничное событие с таймером прерывает подпроцесс и уводит токен по своему
потоку (`cancelActivity="false"` и компенсация пока не моделируются).
"""

from __future__ import annotations

import re
from collections import defaultdict, deque
from collections.abc import Mapping
from dataclasses import dataclass
from typing import NoReturn

from app.bpmn.model import BpmnDocument, Flow, Node, NodeType
from app.schemas.simulation import (
    SimulationBranch,
    SimulationDecision,
    SimulationDecisionReason,
    SimulationReport,
    SimulationStep,
    SimulationStepAction,
    VariableValue,
)
from app.simulation.expressions import (
    ExpressionError,
    MissingVariableError,
    evaluate_condition,
    evaluate_value,
)
from app.simulation.timers import timer_wait_ms


class SimulationError(ValueError):
    """Схему нельзя выполнить: нет старта, тупик, лимит шагов."""


class _NeedsChoice(Exception):
    """Внутренний сигнал: прогон ждёт выбора ветки пользователем."""

    def __init__(self, decision: SimulationDecision) -> None:
        super().__init__(decision.node_id)
        self.decision = decision


@dataclass(frozen=True, slots=True)
class _Token:
    node_id: str
    token: int
    from_flow: str | None = None
    #: id подпроцесса, внутри которого сейчас токен; `None` — верхний уровень.
    scope: str | None = None


def _labelled(node: Node) -> str:
    return f"«{node.name or node.id}»"


def _flow_list(flows: list[Flow]) -> str:
    return ", ".join(flow.id for flow in flows)


#: Присваивание в скрипт-задаче: `имя = выражение` из безопасного вычислителя.
_ASSIGNMENT_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$")


class _Runner:
    def __init__(
        self,
        document: BpmnDocument,
        variables: Mapping[str, VariableValue],
        choices: Mapping[str, str],
        max_steps: int,
    ) -> None:
        self._document = document
        self._variables = dict(variables)
        self._choices = dict(choices)
        self._max_steps = max_steps
        self._nodes: dict[str, Node] = {node.id: node for node in document.all_nodes()}
        self._flows: dict[str, Flow] = {flow.id: flow for flow in document.all_flows()}
        #: вложенный узел → id подпроцесса, в котором он лежит.
        self._parents: dict[str, str] = {}
        for process in document.processes:
            stack: list[tuple[Node, str | None]] = [(node, None) for node in process.nodes]
            while stack:
                node, parent = stack.pop()
                if parent is not None:
                    self._parents[node.id] = parent
                stack.extend((child, node.id) for child in node.nodes)
        self._boundary: dict[str, list[Node]] = defaultdict(list)
        for node in self._nodes.values():
            if node.type is NodeType.BOUNDARY_EVENT and node.attached_to:
                self._boundary[node.attached_to].append(node)
        self._outgoing: dict[str, list[Flow]] = defaultdict(list)
        self._incoming: dict[str, list[Flow]] = defaultdict(list)
        for flow in self._flows.values():
            self._outgoing[flow.source_ref].append(flow)
            self._incoming[flow.target_ref].append(flow)
        self._queue: deque[_Token] = deque()
        self._steps: list[SimulationStep] = []
        self._counts: dict[str, int] = defaultdict(int)
        self._arrivals: dict[str, set[str]] = defaultdict(set)
        self._next_token = 1
        self._completed = 0
        self._started = 0
        self._decision: SimulationDecision | None = None

    # --- запуск -----------------------------------------------------------

    def run(self) -> SimulationReport:
        starts = [node for node in self._document.nodes() if node.type is NodeType.START_EVENT]
        starts = [node for node in starts if not self._incoming.get(node.id)]
        if not starts:
            raise SimulationError("в схеме нет стартового события без входящих потоков")
        for node in starts:
            self._queue.append(_Token(node.id, self._next_token))
            self._next_token += 1
            self._started += 1

        try:
            while self._queue:
                token = self._queue.popleft()
                self._advance(token)
                if len(self._steps) >= self._max_steps:
                    raise SimulationError(
                        f"симуляция остановлена после {self._max_steps} шагов: возможно, цикл"
                    )
        except _NeedsChoice as exc:
            self._decision = exc.decision

        return SimulationReport(
            completed=self._decision is None and self._completed > 0 and not self._queue,
            steps=self._steps,
            counts=dict(sorted(self._counts.items())),
            tokens_started=self._started,
            tokens_completed=self._completed,
            max_steps=self._max_steps,
            decision=self._decision,
        )

    # --- шаг токена -------------------------------------------------------

    def _advance(self, token: _Token) -> None:
        node = self._nodes.get(token.node_id)
        if node is None:
            raise SimulationError(f"поток ведёт в неизвестный элемент {token.node_id!r}")

        changed: tuple[str, ...] = ()
        if node.type is NodeType.SCRIPT_TASK and node.script:
            changed = self._run_script(node)

        if node.type is NodeType.SUB_PROCESS:
            self._enter_subprocess(token, node, changed)
            return

        incoming = self._incoming.get(node.id, [])
        is_parallel_join = node.type is NodeType.PARALLEL_GATEWAY and len(incoming) > 1
        is_inclusive_join = node.type is NodeType.INCLUSIVE_GATEWAY and len(incoming) > 1
        if is_parallel_join:
            arrived = self._arrivals[node.id]
            arrived.add(token.from_flow or "")
            expected = {flow.id for flow in incoming}
            if not expected.issubset(arrived):
                self._log(
                    token,
                    node,
                    "waiting",
                    message=f"ждёт ветки: {_flow_list(incoming)}",
                    changed=changed,
                )
                return
            self._arrivals[node.id] = set()
            self._log(token, node, "completed", message="ветки синхронизированы", changed=changed)
        elif is_inclusive_join:
            # Инклюзивное слияние ждёт не все входы, а только те ветки, которые
            # реально запущены и ещё могут дойти: невыбранные условия и ветки,
            # ушедшие в другой конец процесса, не должны блокировать токен.
            if self._queued_tokens_can_reach(node.id):
                self._log(
                    token,
                    node,
                    "waiting",
                    message="ждёт активные ветки",
                    changed=changed,
                )
                return
            self._log(
                token,
                node,
                "completed",
                message="активные ветки сошлись",
                changed=changed,
            )
        elif node.timer is not None:
            self._log(
                token,
                node,
                "waiting",
                message=f"ожидание таймера: {node.timer.expression}",
                wait_ms=timer_wait_ms(node.timer),
                changed=changed,
            )
        else:
            self._log(token, node, "completed", changed=changed)

        self._counts[node.id] += 1
        if node.type is NodeType.END_EVENT:
            if token.scope is None:
                self._completed += 1
            else:
                self._exit_subprocess(token, node)
            return

        outgoing = self._outgoing.get(node.id, [])
        if not outgoing:
            raise SimulationError(f"тупик: у {_labelled(node)} нет исходящего потока")

        chosen = self._choose_flows(node, outgoing)
        for flow in chosen:
            self._queue.append(_Token(flow.target_ref, token.token, flow.id, token.scope))

    # --- подпроцессы ------------------------------------------------------

    def _enter_subprocess(self, token: _Token, node: Node, changed: tuple[str, ...]) -> None:
        boundary = self._interrupting_boundary(node)
        if boundary is not None:
            self._log(
                token,
                node,
                "completed",
                message=f"прерван граничным событием {_labelled(boundary)}",
                changed=changed,
            )
            self._counts[node.id] += 1
            self._trigger_boundary(token, boundary)
            return

        if not node.is_expanded:
            # Свёрнутый подпроцесс — «чёрный ящик»: один шаг без внутренностей.
            self._log(token, node, "completed", changed=changed)
            self._counts[node.id] += 1
            self._leave_subprocess(token, node, "подпроцесса")
            return

        self._log(token, node, "completed", message="вход в подпроцесс", changed=changed)
        self._counts[node.id] += 1
        starts = [
            inner
            for inner in node.nodes
            if inner.type is NodeType.START_EVENT and not self._incoming.get(inner.id)
        ]
        if not starts:
            # Пустой раскрытый подпроцесс завершается сразу.
            self._leave_subprocess(token, node, "подпроцесса")
            return
        for start in starts:
            self._queue.append(_Token(start.id, token.token, None, node.id))

    def _exit_subprocess(self, token: _Token, end: Node) -> None:
        """Внутренний конец возвращает токен на исходящие потоки подпроцесса."""
        owner_id = token.scope
        if owner_id is None:
            raise SimulationError(f"внутренний конец {_labelled(end)} вне подпроцесса")
        owner = self._nodes[owner_id]
        self._leave_subprocess(token, owner, "подпроцесса")

    def _leave_subprocess(self, token: _Token, node: Node, what: str) -> None:
        outgoing = self._outgoing.get(node.id, [])
        if not outgoing:
            raise SimulationError(f"тупик: у {what} {_labelled(node)} нет исходящего потока")
        scope = self._parents.get(node.id)
        for flow in outgoing:
            self._queue.append(_Token(flow.target_ref, token.token, flow.id, scope))

    def _interrupting_boundary(self, node: Node) -> Node | None:
        """Граничное событие с таймером, которое прерывает подпроцесс."""
        for boundary in self._boundary.get(node.id, []):
            if boundary.timer is None or boundary.cancel_activity is False:
                continue
            return boundary
        return None

    def _trigger_boundary(self, token: _Token, boundary: Node) -> None:
        self._steps.append(
            SimulationStep(
                index=len(self._steps) + 1,
                token=token.token,
                node_id=boundary.id,
                node_name=boundary.name,
                node_type=boundary.type,
                action="waiting",
                message=f"ожидание таймера: {boundary.timer.expression}"
                if boundary.timer
                else None,
                wait_ms=timer_wait_ms(boundary.timer),
                variables=dict(self._variables),
            )
        )
        self._counts[boundary.id] += 1
        outgoing = self._outgoing.get(boundary.id, [])
        if not outgoing:
            raise SimulationError(
                f"тупик: у граничного события {_labelled(boundary)} нет исходящего потока"
            )
        scope = self._parents.get(boundary.attached_to or "")
        for flow in outgoing:
            self._queue.append(_Token(flow.target_ref, token.token, flow.id, scope))

    def _run_script(self, node: Node) -> tuple[str, ...]:
        """Исполняет присваивания скрипт-задачи и возвращает изменённые имена.

        Это не JS/Groovy-рантайм: поддерживаются только строки `имя = выражение`,
        вычисляемые тем же безопасным парсером, что и условия потоков. Такой
        скрипт может изменить переменные прогона, и состояние видно на каждом шаге.
        """
        if not node.script:
            return ()
        changed: list[str] = []
        for number, raw in enumerate(node.script.splitlines(), start=1):
            line = raw.strip()
            if line == "" or line.startswith("#") or line.startswith("//"):
                continue
            match = _ASSIGNMENT_RE.match(line)
            if match is None:
                raise SimulationError(
                    f"скрипт у {_labelled(node)}, строка {number}: "
                    "поддерживаются только присваивания «имя = выражение»"
                )
            name, expression = match.group(1), match.group(2)
            try:
                self._variables[name] = evaluate_value(expression, self._variables)
            except ExpressionError as exc:
                raise SimulationError(
                    f"скрипт у {_labelled(node)}, строка {number}: {exc}"
                ) from exc
            if name not in changed:
                changed.append(name)
        return tuple(changed)

    def _queued_tokens_can_reach(self, target_id: str) -> bool:
        """Есть ли в очереди токен, которому ещё предстоит дойти до слияния."""
        seen: set[str] = set()

        def reaches(node_id: str) -> bool:
            if node_id == target_id:
                return True
            if node_id in seen:
                return False
            seen.add(node_id)
            return any(reaches(flow.target_ref) for flow in self._outgoing.get(node_id, []))

        return any(reaches(token.node_id) for token in self._queue)

    # --- выбор веток ------------------------------------------------------

    def _choose_flows(self, node: Node, outgoing: list[Flow]) -> list[Flow]:
        # Шлюз-слияние (несколько входов, один выход) не оценивает условия:
        # условия принадлежат разветвлению, а не сходящимся веткам.
        if len(self._incoming.get(node.id, [])) > 1 and len(outgoing) == 1:
            return outgoing
        if node.type is NodeType.PARALLEL_GATEWAY:
            return outgoing

        choice = self._choices.get(node.id)
        if choice is not None:
            for flow in outgoing:
                if flow.id == choice:
                    return [flow]
            raise SimulationError(f"выбранный поток {choice!r} не исходит из {_labelled(node)}")

        if node.type is NodeType.EXCLUSIVE_GATEWAY:
            return self._single_branch(node, outgoing)
        if node.type is NodeType.INCLUSIVE_GATEWAY:
            return self._parallel_branches(node, outgoing)
        if node.type is NodeType.EVENT_BASED_GATEWAY:
            # Событийный шлюз ждёт первое событие: без таймеров и сообщений
            # ветку может выбрать только пользователь.
            self._demand_choice(node, outgoing, "no_conditions")
        return self._task_split(node, outgoing)

    def _single_branch(self, node: Node, outgoing: list[Flow]) -> list[Flow]:
        matched, unresolved = self._conditions(node, outgoing)
        if matched:
            return matched[:1]
        if unresolved:
            self._demand_choice(node, outgoing, "variables_missing")
        default = self._fallback_default(node, outgoing)
        if default is not None:
            return [default]
        if any(flow.condition for flow in outgoing):
            self._demand_choice(node, outgoing, "no_match")
        self._demand_choice(node, outgoing, "no_conditions")

    def _parallel_branches(self, node: Node, outgoing: list[Flow]) -> list[Flow]:
        matched, unresolved = self._conditions(node, outgoing)
        if matched:
            return matched
        if unresolved:
            self._demand_choice(node, outgoing, "variables_missing")
        default = self._fallback_default(node, outgoing)
        if default is not None:
            return [default]
        if any(flow.condition for flow in outgoing):
            self._demand_choice(node, outgoing, "no_match")
        self._demand_choice(node, outgoing, "no_conditions")

    def _task_split(self, node: Node, outgoing: list[Flow]) -> list[Flow]:
        """Задача с несколькими выходами — неявный параллельный split."""
        conditional = [flow for flow in outgoing if flow.condition]
        if not conditional:
            return outgoing
        matched, unresolved = self._conditions(node, outgoing)
        if matched:
            return matched
        if unresolved:
            self._demand_choice(node, outgoing, "variables_missing")
        default = self._fallback_default(node, outgoing)
        if default is not None:
            return [default]
        self._demand_choice(node, outgoing, "no_match")

    def _conditions(self, node: Node, outgoing: list[Flow]) -> tuple[list[Flow], bool]:
        """Возвращает сработавшие ветки и признак неизвестной переменной."""
        matched: list[Flow] = []
        unresolved = False
        for flow in outgoing:
            if not flow.condition:
                continue
            try:
                if evaluate_condition(flow.condition, self._variables):
                    matched.append(flow)
            except MissingVariableError:
                unresolved = True
            except ExpressionError as exc:
                raise SimulationError(
                    f"условие потока {flow.id} у {_labelled(node)}: {exc}"
                ) from exc
        return matched, unresolved

    def _fallback_default(self, node: Node, outgoing: list[Flow]) -> Flow | None:
        if node.default_flow:
            for flow in outgoing:
                if flow.id == node.default_flow:
                    return flow
        # Единственный безусловный поток среди условных — фактический default.
        unconditional = [flow for flow in outgoing if not flow.condition]
        if len(unconditional) == 1 and len(unconditional) < len(outgoing):
            return unconditional[0]
        return None

    def _demand_choice(
        self,
        node: Node,
        outgoing: list[Flow],
        reason: SimulationDecisionReason,
    ) -> NoReturn:
        branches = [
            SimulationBranch(
                flow_id=flow.id,
                flow_name=flow.name,
                target_id=flow.target_ref,
                target_name=self._nodes[flow.target_ref].name
                if flow.target_ref in self._nodes
                else None,
                condition=flow.condition,
            )
            for flow in outgoing
        ]
        raise _NeedsChoice(
            SimulationDecision(
                node_id=node.id,
                node_name=node.name,
                node_type=node.type,
                reason=reason,
                branches=branches,
            )
        )

    # --- журнал -----------------------------------------------------------

    def _log(
        self,
        token: _Token,
        node: Node,
        action: SimulationStepAction,
        message: str | None = None,
        wait_ms: int | None = None,
        changed: tuple[str, ...] = (),
    ) -> None:
        self._steps.append(
            SimulationStep(
                index=len(self._steps) + 1,
                token=token.token,
                node_id=node.id,
                node_name=node.name,
                node_type=node.type,
                action=action,
                flow_id=token.from_flow,
                message=message,
                wait_ms=wait_ms,
                variables=dict(self._variables),
                changed=list(changed),
            )
        )


def simulate(
    document: BpmnDocument,
    *,
    variables: Mapping[str, VariableValue] | None = None,
    choices: Mapping[str, str] | None = None,
    max_steps: int = 500,
) -> SimulationReport:
    """Выполняет схему и возвращает журнал шагов, счётчики и признак завершения.

    Если ветку нельзя выбрать по условиям, отчёт приходит с `decision`:
    пользователь выбирает поток, и прогон повторяется с `choices`.
    """
    if max_steps < 1:
        raise SimulationError("max_steps должен быть положительным")
    return _Runner(document, variables or {}, choices or {}, max_steps).run()


__all__ = ["SimulationError", "simulate"]
