"""HTTP-защита: заголовки, 429 и ранний отказ по размеру тела."""

from __future__ import annotations

from typing import Any

import pytest
from app.core.middleware import BodySizeLimitMiddleware, RateLimitMiddleware
from httpx import AsyncClient
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send


async def _receive() -> dict[str, Any]:
    return {"type": "http.request", "body": b"", "more_body": False}


async def _endpoint(scope: Scope, receive: Receive, send: Send) -> None:
    await JSONResponse({"ok": True})(scope, receive, send)


def _scope(method: str = "GET", path: str = "/api/v1/diagrams") -> dict[str, Any]:
    return {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "http_version": "1.1",
        "scheme": "http",
        "query_string": b"",
        "server": ("test", 80),
    }


async def _call(middleware: Any, scope: dict[str, Any]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    await middleware(scope, _receive, send)
    return messages


@pytest.mark.asyncio
async def test_rate_limit_returns_429_for_writes() -> None:
    middleware = RateLimitMiddleware(
        _endpoint, per_minute=10, write_per_minute=2, trust_proxy=False
    )

    assert (await _call(middleware, _scope("PUT")))[0]["status"] == 200
    assert (await _call(middleware, _scope("PUT")))[0]["status"] == 200
    messages = await _call(middleware, _scope("PUT"))

    assert messages[0]["status"] == 429
    headers = dict(messages[0]["headers"])
    assert headers[b"retry-after"]
    assert headers[b"x-ratelimit-limit"] == b"2"


@pytest.mark.asyncio
async def test_body_limit_rejects_declared_large_body() -> None:
    middleware = BodySizeLimitMiddleware(_endpoint, limit=10)
    scope = _scope("POST")
    scope["headers"] = [(b"content-length", b"11")]

    messages = await _call(middleware, scope)

    assert messages[0]["status"] == 413


async def test_security_headers_are_present(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors" in response.headers["content-security-policy"]
