"""HTTP-защита: лимиты запросов, таймауты, размер тела и security headers."""

from __future__ import annotations

import asyncio
import hashlib
import math
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class SecurityHeadersMiddleware:
    """Добавляет заголовки, которые не должны зависеть от конкретного роута."""

    def __init__(self, app: ASGIApp, *, hsts: bool = False) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
                headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
                headers.setdefault(
                    "Content-Security-Policy",
                    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
                )
                if self.hsts:
                    headers.setdefault(
                        "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodySizeLimitMiddleware:
    """Отсекает явно большое тело до того, как FastAPI начнёт его буферизовать."""

    def __init__(self, app: ASGIApp, *, limit: int) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        raw = headers.get(b"content-length")
        if raw is not None:
            try:
                declared = int(raw)
            except ValueError:
                declared = 0
            if declared > self.limit:
                response = JSONResponse(
                    {"detail": "тело запроса больше допустимого"},
                    status_code=413,
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


class RateLimitMiddleware:
    """Скользящее окно в памяти: одного процесса достаточно для демо и v0.1.

    Для нескольких воркеров лимит нужно вынести в Redis; это отмечено в ROADMAP.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        per_minute: int,
        write_per_minute: int,
        trust_proxy: bool,
        enabled: bool = True,
    ) -> None:
        self.app = app
        self.per_minute = max(1, per_minute)
        self.write_per_minute = max(1, write_per_minute)
        self.trust_proxy = trust_proxy
        self.enabled = enabled
        self._events: dict[str, deque[float]] = defaultdict(deque)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self.enabled:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path.endswith("/health") or path.endswith("/health/ready"):
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        write = method in _WRITE_METHODS
        limit = self.write_per_minute if write else self.per_minute
        bucket = "write" if write else "read"
        key = f"{self._subject(scope)}:{bucket}"
        now = time.monotonic()
        events = self._events[key]
        while events and now - events[0] >= 60.0:
            events.popleft()

        if len(events) >= limit:
            retry = max(1, math.ceil(60.0 - (now - events[0])))
            response = JSONResponse(
                {"detail": {"code": "RateLimited", "message": "слишком много запросов"}},
                status_code=429,
                headers={
                    "Retry-After": str(retry),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )
            await response(scope, receive, send)
            return

        events.append(now)
        remaining = max(0, limit - len(events))

        async def send_with_limit(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-RateLimit-Limit", str(limit))
                headers.setdefault("X-RateLimit-Remaining", str(remaining))
            await send(message)

        await self.app(scope, receive, send_with_limit)

    def _subject(self, scope: Scope) -> str:
        """Анонимные запросы считаем по IP, авторизованные — по токену."""
        headers = dict(scope["headers"])
        authorization = headers.get(b"authorization")
        if authorization:
            digest = hashlib.sha256(authorization).hexdigest()[:24]
            return f"token:{digest}"
        return f"ip:{self._client_ip(scope)}"

    def _client_ip(self, scope: Scope) -> str:
        if self.trust_proxy:
            headers = dict(scope["headers"])
            forwarded = headers.get(b"x-forwarded-for")
            if forwarded:
                return str(forwarded.decode("latin-1").split(",", 1)[0].strip())
        client = scope.get("client")
        return str(client[0]) if client else "unknown"


class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    """Ограничивает время обработки запроса, чтобы дорогая валидация не висела."""

    def __init__(self, app: ASGIApp, *, seconds: float) -> None:
        super().__init__(app)
        self.seconds = seconds

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        try:
            async with asyncio.timeout(self.seconds):
                return await call_next(request)
        except TimeoutError:
            return JSONResponse(
                {
                    "detail": {
                        "code": "RequestTimeout",
                        "message": "запрос выполнялся слишком долго",
                    }
                },
                status_code=504,
            )


__all__ = [
    "BodySizeLimitMiddleware",
    "RateLimitMiddleware",
    "RequestTimeoutMiddleware",
    "SecurityHeadersMiddleware",
]
