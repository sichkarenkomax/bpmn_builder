"""События ядра для модулей (4.0.3).

Ядро пишет событие в Redis Stream после коммита транзакции. Поток — это и
есть outbox: он переживает падение и рестарт воркера, пока жив Redis.
Модули подписываются на типы через `EventSubscriber`; ядро о подписчиках
ничего не знает. In-memory очереди здесь нет намеренно.

Доставка — at-least-once с идемпотентностью по `event.id`: повторная выдача
того же события не вызывает обработчик второй раз.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from redis.exceptions import RedisError, ResponseError
from redis.typing import EncodableT, FieldT

from app.core.config import get_settings
from app.core.db import get_redis

logger = logging.getLogger(__name__)

DIAGRAM_SAVED = "diagram.saved"
COMMENT_CREATED = "comment.created"
USER_CREATED = "user.created"

EVENT_TYPES = frozenset({DIAGRAM_SAVED, COMMENT_CREATED, USER_CREATED})

#: Сколько живёт отметка «событие обработано». Дольше любого рестарта.
HANDLED_TTL_SECONDS = 7 * 24 * 60 * 60

EventHandler = Callable[["Event"], Awaitable[None]]


@dataclass(frozen=True)
class Event:
    """Событие в том виде, в каком оно лежит в потоке и приходит модулю."""

    id: str
    type: str
    payload: dict[str, Any]
    occurred_at: str

    def as_fields(self) -> dict[FieldT, EncodableT]:
        return {
            "id": self.id,
            "type": self.type,
            "payload": json.dumps(self.payload, ensure_ascii=False, separators=(",", ":")),
            "occurred_at": self.occurred_at,
        }

    @classmethod
    def from_fields(cls, fields: dict[str, str]) -> Event:
        return cls(
            id=fields["id"],
            type=fields["type"],
            payload=json.loads(fields.get("payload") or "{}"),
            occurred_at=fields.get("occurred_at") or "",
        )


async def publish(
    event_type: str,
    payload: dict[str, Any],
    *,
    redis: Any | None = None,
) -> Event | None:
    """Публикует событие; недоступный Redis не валит сохранение диаграммы."""
    if event_type not in EVENT_TYPES:
        msg = f"неизвестный тип события: {event_type}"
        raise ValueError(msg)

    event = Event(
        id=str(uuid.uuid4()),
        type=event_type,
        payload=payload,
        occurred_at=datetime.now(UTC).isoformat(),
    )
    settings = get_settings()
    client = redis if redis is not None else get_redis()
    try:
        await client.xadd(
            settings.events_stream,
            event.as_fields(),
            maxlen=settings.events_maxlen,
            approximate=True,
        )
    except (RedisError, OSError):
        logger.warning("событие %s не опубликовано", event_type, exc_info=True)
        return None
    return event


class EventSubscriber:
    """Читает поток consumer-группой и раздаёт события обработчикам модуля."""

    def __init__(
        self,
        *,
        group: str | None = None,
        consumer: str | None = None,
        redis: Any | None = None,
        stream: str | None = None,
    ) -> None:
        settings = get_settings()
        self.stream = stream or settings.events_stream
        self.group = group or settings.events_consumer_group
        self.consumer = consumer or f"worker-{os.getpid()}"
        self._redis = redis
        self._handlers: dict[str, list[EventHandler]] = {}
        self._group_ready = False

    @property
    def redis(self) -> Any:
        if self._redis is None:
            self._redis = get_redis()
        return self._redis

    def on(self, event_type: str, handler: EventHandler) -> None:
        """Подписка модуля; ядро этот вызов не делает."""
        if event_type not in EVENT_TYPES:
            msg = f"неизвестный тип события: {event_type}"
            raise ValueError(msg)
        self._handlers.setdefault(event_type, []).append(handler)

    async def ensure_group(self) -> None:
        if self._group_ready:
            return
        try:
            await self.redis.xgroup_create(self.stream, self.group, id="0", mkstream=True)
        except ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise
        self._group_ready = True

    async def run_once(self, *, block_ms: int = 1000, count: int = 50) -> int:
        """Забирает пачку новых сообщений; возвращает число доставленных."""
        await self.ensure_group()
        batches = await self.redis.xreadgroup(
            self.group,
            self.consumer,
            {self.stream: ">"},
            count=count,
            block=block_ms,
        )
        delivered = 0
        for _stream, messages in batches or []:
            for message_id, fields in messages:
                await self._deliver(message_id, fields)
                delivered += 1
        return delivered

    async def _deliver(self, message_id: str, fields: dict[str, str]) -> None:
        event = Event.from_fields(fields)
        handled_key = f"{self.stream}:handled:{self.group}:{event.id}"
        first_delivery = await self.redis.set(
            handled_key,
            "1",
            nx=True,
            ex=HANDLED_TTL_SECONDS,
        )
        if first_delivery:
            try:
                for handler in self._handlers.get(event.type, ()):
                    await handler(event)
            except Exception:
                # Снимаем отметку: сообщение останется в pending и повторится.
                await self.redis.delete(handled_key)
                raise
        await self.redis.xack(self.stream, self.group, message_id)

    async def run_forever(self, *, block_ms: int = 5000) -> None:
        """Цикл воркера: ошибки Redis не роняют процесс, а ждут переподключения."""
        while True:
            try:
                await self.run_once(block_ms=block_ms)
            except asyncio.CancelledError:
                raise
            except (RedisError, OSError):
                logger.warning("поток событий недоступен, повтор через секунду", exc_info=True)
                await asyncio.sleep(1)


__all__ = [
    "COMMENT_CREATED",
    "DIAGRAM_SAVED",
    "EVENT_TYPES",
    "USER_CREATED",
    "Event",
    "EventHandler",
    "EventSubscriber",
    "publish",
]
