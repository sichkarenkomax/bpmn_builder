"""Сохранённые прогоны и тест-кейсы симуляции (этап 3, `v0.3`)."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

API = "/api/v1"

NS = (
    'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
    'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
    'xmlns:di="http://www.omg.org/spec/DD/20100524/DI"'
)

XML = f"""<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions {NS} id="D" targetNamespace="http://bpmn-studio.dev/test">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:scriptTask id="Prepare" name="Подготовить" scriptFormat="python">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
      <bpmn:script>total = total + 1</bpmn:script>
    </bpmn:scriptTask>
    <bpmn:endEvent id="End"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Prepare" />
    <bpmn:sequenceFlow id="F2" sourceRef="Prepare" targetRef="End" />
  </bpmn:process>
</bpmn:definitions>"""


async def create_diagram(client: AsyncClient) -> str:
    created = await client.post(
        f"{API}/diagrams", json={"title": "Сохранённый прогон", "bpmn_xml": XML}
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


async def test_saved_run_keeps_report_and_can_be_deleted(db_client: AsyncClient) -> None:
    diagram_id = await create_diagram(db_client)

    saved = await db_client.post(
        f"{API}/diagrams/{diagram_id}/simulation-runs",
        json={"variables": {"total": 1}},
    )
    assert saved.status_code == 201, saved.text
    run: dict[str, Any] = saved.json()
    assert run["diagram_id"] == diagram_id
    assert run["version_id"]
    assert run["variables"] == {"total": 1}
    assert run["report"]["completed"] is True
    assert [step["node_id"] for step in run["report"]["steps"]] == ["Start", "Prepare", "End"]

    listed = await db_client.get(f"{API}/diagrams/{diagram_id}/simulation-runs")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [run["id"]]

    deleted = await db_client.delete(f"{API}/diagrams/{diagram_id}/simulation-runs/{run['id']}")
    assert deleted.status_code == 204
    again = await db_client.delete(f"{API}/diagrams/{diagram_id}/simulation-runs/{run['id']}")
    assert again.status_code == 404


async def test_run_history_is_capped_at_twenty(db_client: AsyncClient) -> None:
    diagram_id = await create_diagram(db_client)

    ids: list[str] = []
    for _ in range(21):
        saved = await db_client.post(
            f"{API}/diagrams/{diagram_id}/simulation-runs", json={"variables": {"total": 1}}
        )
        assert saved.status_code == 201, saved.text
        ids.append(saved.json()["id"])

    listed = await db_client.get(f"{API}/diagrams/{diagram_id}/simulation-runs")
    assert listed.status_code == 200
    kept = [item["id"] for item in listed.json()]
    assert len(kept) == 20
    assert ids[0] not in kept
    assert ids[-1] in kept


async def test_test_case_pass_and_fail_with_diff(db_client: AsyncClient) -> None:
    diagram_id = await create_diagram(db_client)
    expected_steps = ["Start", "Prepare", "End"]

    created = await db_client.post(
        f"{API}/diagrams/{diagram_id}/test-cases",
        json={
            "name": "Увеличение total",
            "variables": {"total": 1},
            "expected_steps": expected_steps,
            "expected_variables": {"total": 2},
        },
    )
    assert created.status_code == 201, created.text
    case: dict[str, Any] = created.json()

    passed = await db_client.post(f"{API}/diagrams/{diagram_id}/test-cases/{case['id']}/run")
    assert passed.status_code == 200, passed.text
    result: dict[str, Any] = passed.json()
    assert result["passed"] is True
    assert result["step_diffs"] == [] and result["variable_diffs"] == []
    assert result["report"]["steps"][-1]["variables"] == {"total": 2}

    wrong_value = await db_client.post(
        f"{API}/diagrams/{diagram_id}/test-cases",
        json={
            "name": "Неверное значение",
            "variables": {"total": 1},
            "expected_steps": expected_steps,
            "expected_variables": {"total": 5},
        },
    )
    assert wrong_value.status_code == 201
    value_result = await db_client.post(
        f"{API}/diagrams/{diagram_id}/test-cases/{wrong_value.json()['id']}/run"
    )
    assert value_result.status_code == 200
    body: dict[str, Any] = value_result.json()
    assert body["passed"] is False
    assert body["variable_diffs"] == [{"name": "total", "expected": 5, "actual": 2}]

    wrong_steps = await db_client.post(
        f"{API}/diagrams/{diagram_id}/test-cases",
        json={
            "name": "Пропущен шаг",
            "variables": {"total": 1},
            "expected_steps": ["Start", "End"],
        },
    )
    assert wrong_steps.status_code == 201
    step_result = await db_client.post(
        f"{API}/diagrams/{diagram_id}/test-cases/{wrong_steps.json()['id']}/run"
    )
    assert step_result.status_code == 200
    step_body: dict[str, Any] = step_result.json()
    assert step_body["passed"] is False
    assert step_body["step_diffs"] == [
        {"index": 1, "expected": "End", "actual": "Prepare"},
        {"index": 2, "expected": None, "actual": "End"},
    ]

    listed = await db_client.get(f"{API}/diagrams/{diagram_id}/test-cases")
    assert listed.status_code == 200
    assert len(listed.json()) == 3

    deleted = await db_client.delete(f"{API}/diagrams/{diagram_id}/test-cases/{case['id']}")
    assert deleted.status_code == 204


async def test_runs_and_cases_stay_inside_their_diagram(db_client: AsyncClient) -> None:
    first = await create_diagram(db_client)
    second = await create_diagram(db_client)

    created = await db_client.post(
        f"{API}/diagrams/{first}/test-cases",
        json={"name": "Чужой кейс", "variables": {"total": 1}},
    )
    assert created.status_code == 201
    case_id = created.json()["id"]

    missing = await db_client.post(f"{API}/diagrams/{second}/test-cases/{case_id}/run")
    assert missing.status_code == 404

    bad_save = await db_client.post(f"{API}/diagrams/missing/simulation-runs", json={})
    assert bad_save.status_code == 404
