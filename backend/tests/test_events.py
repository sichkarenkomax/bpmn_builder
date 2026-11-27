"""4.0.3: события переживают рестарт воркера, доставка идемпотентна."""

from __future__ import annotations

from typing import Any

import fakeredis
import pytest
from app.core.events import (
    COMMENT_CREATED,
    DIAGRAM_SAVED,
    Event,
    EventSubscriber,
    publish,
)
from httpx import AsyncClient

API = "/api/v1"


@pytest.fixture
def events_redis() -> fakeredis.FakeAsyncRedis:
    return fakeredis.FakeAsyncRedis(decode_responses=True)


async def test_event_survives_worker_restart(events_redis: fakeredis.FakeAsyncRedis) -> None:
    published = await publish(DIAGRAM_SAVED, {"diagram_id": "d-1"}, redis=events_redis)
    assert published is not None

    # Воркер поднимается уже после публикации — событие ждёт в потоке.
    seen: list[Event] = []

    async def handler(event: Event) -> None:
        seen.append(event)

    worker = EventSubscriber(redis=events_redis, consumer="worker-b")
    worker.on(DIAGRAM_SAVED, handler)

    assert await worker.run_once(block_ms=1) == 1
    assert [event.id for event in seen] == [published.id]
    assert seen[0].payload == {"diagram_id": "d-1"}

    # Перезапуск: тот же поток, новый consumer, новых сообщений нет.
    restarted = EventSubscriber(redis=events_redis, consumer="worker-b-restarted")
    restarted.on(DIAGRAM_SAVED, handler)
    assert await restarted.run_once(block_ms=1) == 0
    assert len(seen) == 1


async def test_redelivery_of_same_event_is_idempotent(
    events_redis: fakeredis.FakeAsyncRedis,
) -> None:
    published = await publish(DIAGRAM_SAVED, {"diagram_id": "d-2"}, redis=events_redis)
    assert published is not None
    seen: list[str] = []

    async def handler(event: Event) -> None:
        seen.append(event.id)

    worker = EventSubscriber(redis=events_redis, consumer="worker-c")
    worker.on(DIAGRAM_SAVED, handler)
    await worker.run_once(block_ms=1)

    # Повторная доставка того же event.id (например, после сбоя перед ACK).
    await events_redis.xadd(
        worker.stream,
        published.as_fields(),
        maxlen=100,
    )
    assert await worker.run_once(block_ms=1) == 1
    assert seen == [published.id]


async def test_publish_rejects_unknown_type(events_redis: fakeredis.FakeAsyncRedis) -> None:
    with pytest.raises(ValueError):
        await publish("diagram.deleted", {}, redis=events_redis)


async def test_diagram_save_emits_event(
    db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    emitted: list[tuple[str, dict[str, Any]]] = []

    async def fake_publish(event_type: str, payload: dict[str, Any], **_: Any) -> None:
        emitted.append((event_type, payload))

    monkeypatch.setattr("app.api.routes.diagrams.publish_event", fake_publish)

    created = await db_client.post(f"{API}/diagrams", json={"title": "С событием"})
    assert created.status_code == 201, created.text
    diagram = created.json()

    xml = (await db_client.get(f"{API}/diagrams/{diagram['id']}/bpmn")).text
    saved = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=(xml + "\n").encode(),
        headers={"Content-Type": "application/xml", "If-Match": f'"{diagram["etag"]}"'},
    )
    assert saved.status_code == 200, saved.text

    assert [event_type for event_type, _ in emitted] == [DIAGRAM_SAVED, DIAGRAM_SAVED]
    assert emitted[0][1]["diagram_id"] == diagram["id"]
    assert emitted[1][1]["diagram_id"] == diagram["id"]


async def test_comment_create_emits_event(
    db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    emitted: list[tuple[str, dict[str, Any]]] = []

    async def fake_publish(event_type: str, payload: dict[str, Any], **_: Any) -> None:
        emitted.append((event_type, payload))

    monkeypatch.setattr("app.api.routes.comments.publish_event", fake_publish)

    diagram = (await db_client.post(f"{API}/diagrams", json={"title": "Комментарий"})).json()
    created = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/comments",
        json={"element_id": "Task_1", "body": "текст"},
    )
    assert created.status_code == 201, created.text

    assert [event_type for event_type, _ in emitted] == [COMMENT_CREATED]
    assert emitted[0][1] == {
        "diagram_id": diagram["id"],
        "comment_id": created.json()["id"],
        "element_id": "Task_1",
        "author_id": "test-user",
    }
