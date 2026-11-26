"""Симуляция токена: выражения, шлюзы и API (этап 3, `v0.3`)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from app.bpmn import BpmnDocument, parse_bpmn, serialize_bpmn
from app.bpmn.model import TimerDefinition, TimerKind
from app.simulation import ExpressionError, SimulationError, evaluate_condition, simulate
from app.simulation.expressions import ExpressionError as ExpressionErrorDirect
from app.simulation.timers import parse_duration_ms, timer_wait_ms
from httpx import AsyncClient

API = "/api/v1"
FIXTURES = Path(__file__).parent / "fixtures" / "bpmn"

NS = (
    'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
    'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
    'xmlns:di="http://www.omg.org/spec/DD/20100524/DI"'
)


def xml(body: str) -> str:
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<bpmn:definitions {NS} id="D" targetNamespace="http://bpmn-studio.dev/test">'
        f"{body}</bpmn:definitions>"
    )


def document(body: str) -> BpmnDocument:
    return parse_bpmn(xml(body))


def linear_body() -> str:
    return """
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task" name="Согласовать"><bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="End"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Task" />
    <bpmn:sequenceFlow id="F2" sourceRef="Task" targetRef="End" />
  </bpmn:process>"""


def exclusive_body() -> str:
    return """
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:exclusiveGateway id="Split" name="Сумма" default="FHigh">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>FLow</bpmn:outgoing>
      <bpmn:outgoing>FHigh</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Low" name="Малая"><bpmn:incoming>FLow</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing></bpmn:task>
    <bpmn:task id="High" name="Большая"><bpmn:incoming>FHigh</bpmn:incoming>
      <bpmn:outgoing>F3</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End"><bpmn:incoming>F2</bpmn:incoming>
      <bpmn:incoming>F3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Split" />
    <bpmn:sequenceFlow id="FLow" sourceRef="Split" targetRef="Low">
      <bpmn:conditionExpression>amount &lt; 1000</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="FHigh" sourceRef="Split" targetRef="High" />
    <bpmn:sequenceFlow id="F2" sourceRef="Low" targetRef="End" />
    <bpmn:sequenceFlow id="F3" sourceRef="High" targetRef="End" />
  </bpmn:process>"""


def parallel_body() -> str:
    return """
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:parallelGateway id="Split"><bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>FA</bpmn:outgoing>
      <bpmn:outgoing>FB</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:task id="A"><bpmn:incoming>FA</bpmn:incoming>
      <bpmn:outgoing>FA2</bpmn:outgoing></bpmn:task>
    <bpmn:task id="B"><bpmn:incoming>FB</bpmn:incoming>
      <bpmn:outgoing>FB2</bpmn:outgoing></bpmn:task>
    <bpmn:parallelGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming>
      <bpmn:incoming>FB2</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:endEvent id="End"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Split" />
    <bpmn:sequenceFlow id="FA" sourceRef="Split" targetRef="A" />
    <bpmn:sequenceFlow id="FB" sourceRef="Split" targetRef="B" />
    <bpmn:sequenceFlow id="FA2" sourceRef="A" targetRef="Join" />
    <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
    <bpmn:sequenceFlow id="F2" sourceRef="Join" targetRef="End" />
  </bpmn:process>"""


# --- выражения -------------------------------------------------------------


def test_expression_precedence_and_variables() -> None:
    assert evaluate_condition("amount < 1000 && status == 'new'", {"amount": 500, "status": "new"})
    assert not evaluate_condition(
        "amount >= 1000 || !(status == 'new')", {"amount": 500, "status": "new"}
    )
    assert evaluate_condition("(1 + 2) * 3 == 9", {})
    assert evaluate_condition("rate / 2 > 0.4", {"rate": 1})


def test_expression_rejects_code_and_missing_variables() -> None:
    with pytest.raises(ExpressionError):
        evaluate_condition("__import__('os')", {})
    with pytest.raises(ExpressionError, match="не задана"):
        evaluate_condition("missing > 1", {})
    with pytest.raises(ExpressionError, match="деление на ноль"):
        evaluate_condition("1 / 0", {})
    assert ExpressionError is ExpressionErrorDirect


# --- движок ----------------------------------------------------------------


def test_linear_process_runs_to_end() -> None:
    report = simulate(document(linear_body()))
    assert report.completed
    assert [step.node_id for step in report.steps] == ["Start", "Task", "End"]
    assert [step.index for step in report.steps] == [1, 2, 3]
    assert report.counts == {"Start": 1, "Task": 1, "End": 1}
    assert report.tokens_started == report.tokens_completed == 1


def inclusive_body() -> str:
    return """
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:inclusiveGateway id="Split"><bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>FA</bpmn:outgoing>
      <bpmn:outgoing>FB</bpmn:outgoing></bpmn:inclusiveGateway>
    <bpmn:task id="A"><bpmn:incoming>FA</bpmn:incoming>
      <bpmn:outgoing>FA2</bpmn:outgoing></bpmn:task>
    <bpmn:task id="B"><bpmn:incoming>FB</bpmn:incoming>
      <bpmn:outgoing>FB2</bpmn:outgoing></bpmn:task>
    <bpmn:inclusiveGateway id="Join"><bpmn:incoming>FA2</bpmn:incoming>
      <bpmn:incoming>FB2</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing></bpmn:inclusiveGateway>
    <bpmn:endEvent id="End"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Split" />
    <bpmn:sequenceFlow id="FA" sourceRef="Split" targetRef="A">
      <bpmn:conditionExpression>ok == true</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="FB" sourceRef="Split" targetRef="B">
      <bpmn:conditionExpression>vip == true</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="FA2" sourceRef="A" targetRef="Join" />
    <bpmn:sequenceFlow id="FB2" sourceRef="B" targetRef="Join" />
    <bpmn:sequenceFlow id="F2" sourceRef="Join" targetRef="End" />
  </bpmn:process>"""


def test_exclusive_gateway_uses_condition_and_default() -> None:
    low = simulate(document(exclusive_body()), variables={"amount": 10})
    assert low.completed
    assert "Low" in low.counts and "High" not in low.counts

    high = simulate(document(exclusive_body()), variables={"amount": 5000})
    assert high.completed
    assert "High" in high.counts and "Low" not in high.counts


def test_parallel_split_waits_for_both_branches() -> None:
    report = simulate(document(parallel_body()))
    assert report.completed
    assert report.counts["A"] == 1 and report.counts["B"] == 1
    assert report.counts["Join"] == 1
    assert report.tokens_completed == 1
    assert any(step.action == "waiting" for step in report.steps)


def test_inclusive_join_waits_only_for_started_branches() -> None:
    both = simulate(document(inclusive_body()), variables={"ok": True, "vip": True})
    assert both.completed
    assert both.counts["A"] == 1 and both.counts["B"] == 1
    assert both.counts["Join"] == 1
    assert both.tokens_completed == 1
    assert any(step.action == "waiting" for step in both.steps)

    # Вторая ветка не выбрана условием: слияние не должно её ждать.
    single = simulate(document(inclusive_body()), variables={"ok": True, "vip": False})
    assert single.completed
    assert single.counts["A"] == 1 and "B" not in single.counts
    assert single.counts["Join"] == 1
    assert not any(step.action == "waiting" for step in single.steps)


def test_process_without_start_or_with_dead_end_fails() -> None:
    no_start = document('<bpmn:process id="P"><bpmn:task id="T" /></bpmn:process>')
    with pytest.raises(SimulationError, match="стартового события"):
        simulate(no_start)

    dead_end = document(
        """
  <bpmn:process id="P">
    <bpmn:startEvent id="S"><bpmn:outgoing>F</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="T"><bpmn:incoming>F</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T" />
  </bpmn:process>"""
    )
    with pytest.raises(SimulationError, match="тупик"):
        simulate(dead_end)


def test_unknown_variable_asks_for_manual_branch() -> None:
    report = simulate(document(exclusive_body()))
    assert not report.completed
    assert report.decision is not None
    assert report.decision.node_id == "Split"
    assert report.decision.reason == "variables_missing"
    assert {branch.flow_id for branch in report.decision.branches} == {"FLow", "FHigh"}
    assert [step.node_id for step in report.steps] == ["Start", "Split"]

    chosen = simulate(document(exclusive_body()), choices={"Split": "FLow"})
    assert chosen.completed
    assert chosen.decision is None
    assert "Low" in chosen.counts and "High" not in chosen.counts

    with pytest.raises(SimulationError, match="не исходит"):
        simulate(document(exclusive_body()), choices={"Split": "F1"})


def test_gateway_without_conditions_offers_branches() -> None:
    body = exclusive_body()
    body = body.replace(' default="FHigh"', "")
    body = body.replace(
        "      <bpmn:conditionExpression>amount &lt; 1000</bpmn:conditionExpression>\n", ""
    )
    report = simulate(document(body))
    assert report.decision is not None
    assert report.decision.reason == "no_conditions"
    assert len(report.decision.branches) == 2


def test_bad_condition_and_step_limit_are_reported() -> None:
    body = exclusive_body().replace("amount &lt; 1000", "1 &lt;")
    with pytest.raises(SimulationError, match="FLow"):
        simulate(document(body))

    # Петля из двух задач упирается в лимит шагов.
    loop = document(
        """
  <bpmn:process id="P">
    <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="A"><bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing></bpmn:task>
    <bpmn:task id="B"><bpmn:incoming>F2</bpmn:incoming>
      <bpmn:outgoing>F3</bpmn:outgoing></bpmn:task>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A" />
    <bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="B" />
    <bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="A" />
  </bpmn:process>"""
    )
    with pytest.raises(SimulationError, match="цикл"):
        simulate(loop, max_steps=20)


# --- таймеры ---------------------------------------------------------------


def timer_body(kind: str = "timeDuration", value: str = "PT1H30M") -> str:
    return f"""
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:intermediateCatchEvent id="Wait" name="Пауза">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
      <bpmn:timerEventDefinition><bpmn:{kind}>{value}</bpmn:{kind}>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="End"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Wait" />
    <bpmn:sequenceFlow id="F2" sourceRef="Wait" targetRef="End" />
  </bpmn:process>"""


def test_timer_definition_parsed_and_serialized() -> None:
    document = parse_bpmn(xml(timer_body()))
    wait = next(node for node in document.nodes() if node.id == "Wait")
    assert wait.timer == TimerDefinition(kind=TimerKind.DURATION, expression="PT1H30M")

    restored = parse_bpmn(serialize_bpmn(document.detached()))
    wait = next(node for node in restored.nodes() if node.id == "Wait")
    assert wait.timer == TimerDefinition(kind=TimerKind.DURATION, expression="PT1H30M")


def test_empty_timer_definition_is_ignored() -> None:
    document = parse_bpmn(xml(timer_body("timeDate", "")))
    wait = next(node for node in document.nodes() if node.id == "Wait")
    assert wait.timer is None


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("PT45S", 45_000),
        ("PT1H30M", 5_400_000),
        ("P1DT2H", 93_600_000),
        ("P1W", 604_800_000),
        ("PT0,5S", 500),
        ("P", None),
        ("PT", None),
        ("1 hour", None),
    ],
)
def test_parse_duration_ms(expression: str, expected: int | None) -> None:
    assert parse_duration_ms(expression) == expected


def test_timer_step_waits_for_duration() -> None:
    report = simulate(document(timer_body()))
    assert report.completed is True
    wait = next(step for step in report.steps if step.node_id == "Wait")
    assert wait.action == "waiting"
    assert wait.wait_ms == 5_400_000
    assert wait.message == "ожидание таймера: PT1H30M"


def test_timer_date_has_no_wait_but_still_waits() -> None:
    report = simulate(document(timer_body("timeDate", "2026-12-31T23:59:59Z")))
    assert report.completed is True
    wait = next(step for step in report.steps if step.node_id == "Wait")
    assert wait.action == "waiting"
    assert wait.wait_ms is None


def test_timer_wait_ms_ignores_non_duration() -> None:
    timer = TimerDefinition(kind=TimerKind.CYCLE, expression="R3/PT10M")
    assert timer_wait_ms(timer) is None
    assert timer_wait_ms(None) is None


# --- API -------------------------------------------------------------------


async def test_api_simulate_returns_steps_and_validation_errors(db_client: AsyncClient) -> None:
    xml_text = (FIXTURES / "camunda-simple.bpmn").read_text(encoding="utf-8")
    created = await db_client.post(
        f"{API}/diagrams", json={"title": "Симуляция", "bpmn_xml": xml_text}
    )
    assert created.status_code == 201, created.text
    diagram: dict[str, Any] = created.json()

    response = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/simulate",
        json={"variables": {"reviewer": "anna"}, "max_steps": 100},
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["completed"] is True
    assert report["schema_version"] == "1.0"
    assert [step["node_id"] for step in report["steps"]] == [
        "StartEvent_1",
        "Task_Review",
        "EndEvent_1",
    ]
    assert report["counts"]["Task_Review"] == 1

    too_small = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/simulate", json={"max_steps": 0}
    )
    assert too_small.status_code == 422

    no_version = await db_client.post(f"{API}/diagrams/missing/simulate", json={})
    assert no_version.status_code == 404


async def test_api_simulate_reports_unsimulatable_schema(db_client: AsyncClient) -> None:
    empty = await db_client.post(f"{API}/diagrams", json={"title": "Пустая"})
    assert empty.status_code == 201, empty.text
    diagram: dict[str, Any] = empty.json()

    response = await db_client.post(f"{API}/diagrams/{diagram['id']}/simulate", json={})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "SimulationError"
