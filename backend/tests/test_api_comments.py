"""Комментарии на холсте (1.3.8): создание, ветка элемента, resolve, удаление."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

API = "/api/v1"


async def _diagram(client: AsyncClient) -> dict[str, Any]:
    response = await client.post(f"{API}/diagrams", json={"title": "С комментариями"})
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def test_comment_lifecycle(db_client: AsyncClient) -> None:
    diagram = await _diagram(db_client)
    url = f"{API}/diagrams/{diagram['id']}/comments"

    created = await db_client.post(url, json={"element_id": "Task_1", "body": "  Уточнить SLA  "})
    assert created.status_code == 201, created.text
    comment = created.json()
    assert comment["element_id"] == "Task_1"
    assert comment["body"] == "Уточнить SLA"
    assert comment["author_id"] == "test-user"
    assert comment["resolved_at"] is None

    reply = await db_client.post(url, json={"element_id": "Task_1", "body": "SLA — 4 часа"})
    assert reply.status_code == 201

    listed = (await db_client.get(url)).json()
    assert [item["body"] for item in listed] == ["Уточнить SLA", "SLA — 4 часа"]

    resolved = await db_client.patch(f"{url}/{comment['id']}", json={"resolved": True})
    assert resolved.status_code == 200
    assert resolved.json()["resolved_at"] is not None

    reopened = await db_client.patch(f"{url}/{comment['id']}", json={"resolved": False})
    assert reopened.json()["resolved_at"] is None

    edited = await db_client.patch(f"{url}/{comment['id']}", json={"body": "SLA согласован"})
    assert edited.json()["body"] == "SLA согласован"

    deleted = await db_client.delete(f"{url}/{comment['id']}")
    assert deleted.status_code == 204
    assert len((await db_client.get(url)).json()) == 1


async def test_comments_filter_by_element_and_resolved(db_client: AsyncClient) -> None:
    diagram = await _diagram(db_client)
    url = f"{API}/diagrams/{diagram['id']}/comments"
    first = (await db_client.post(url, json={"element_id": "Task_1", "body": "раз"})).json()
    await db_client.post(url, json={"element_id": "Task_2", "body": "два"})
    await db_client.patch(f"{url}/{first['id']}", json={"resolved": True})

    by_element = (await db_client.get(url, params={"element_id": "Task_2"})).json()
    assert [item["body"] for item in by_element] == ["два"]

    active = (await db_client.get(url, params={"include_resolved": "false"})).json()
    assert [item["body"] for item in active] == ["два"]

    everything = (await db_client.get(url)).json()
    assert len(everything) == 2


async def test_comment_validation_and_404(db_client: AsyncClient) -> None:
    diagram = await _diagram(db_client)
    url = f"{API}/diagrams/{diagram['id']}/comments"

    empty = await db_client.post(url, json={"element_id": "Task_1", "body": "   "})
    assert empty.status_code == 400
    assert (await db_client.post(url, json={"element_id": "Task_1", "body": ""})).status_code == 422

    assert (await db_client.get(f"{API}/diagrams/nope/comments")).status_code == 404
    assert (
        await db_client.post(f"{API}/diagrams/nope/comments", json={"body": "x"})
    ).status_code == 404

    # Комментарий чужой диаграммы не должен читаться/удаляться через её id.
    comment = (await db_client.post(url, json={"body": "x"})).json()
    other = await _diagram(db_client)
    assert (
        await db_client.patch(f"{API}/diagrams/{other['id']}/comments/{comment['id']}", json={})
    ).status_code == 404
    assert (
        await db_client.delete(f"{API}/diagrams/{other['id']}/comments/{comment['id']}")
    ).status_code == 404
