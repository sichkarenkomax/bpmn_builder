"""Тесты health-эндпоинтов."""

import pytest
from app.api.routes import health as health_module
from app.core.checks import CheckResult
from httpx import AsyncClient

API = "/api/v1"


async def test_liveness_reports_service(client: AsyncClient) -> None:
    response = await client.get(f"{API}/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "bpmn-studio"
    assert body["version"] == "0.1.0"


async def test_readiness_ok_when_dependencies_up(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def up() -> CheckResult:
        return CheckResult(ok=True, latency_ms=1.25)

    monkeypatch.setattr(health_module, "check_database", up)
    monkeypatch.setattr(health_module, "check_cache", up)

    response = await client.get(f"{API}/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["dependencies"]["database"] == {"status": "up", "latency_ms": 1.25, "detail": None}
    assert body["dependencies"]["cache"]["status"] == "up"


@pytest.mark.parametrize(
    ("db_ok", "cache_ok", "down"),
    [(False, True, "database"), (True, False, "cache"), (False, False, None)],
)
async def test_readiness_degraded_with_503(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    db_ok: bool,
    cache_ok: bool,
    down: str | None,
) -> None:
    async def db() -> CheckResult:
        return CheckResult(ok=db_ok, latency_ms=0.5, detail=None if db_ok else "OSError")

    async def cache() -> CheckResult:
        return CheckResult(ok=cache_ok, latency_ms=0.5, detail=None if cache_ok else "TimeoutError")

    monkeypatch.setattr(health_module, "check_database", db)
    monkeypatch.setattr(health_module, "check_cache", cache)

    response = await client.get(f"{API}/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    if down is not None:
        assert body["dependencies"][down]["status"] == "down"
        assert body["dependencies"][down]["detail"] is not None


async def test_openapi_is_served(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert f"{API}/health" in paths
    assert f"{API}/health/ready" in paths
