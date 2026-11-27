"""4.0.4: реестр модулей и feature flags `MODULES_ENABLED`."""

from __future__ import annotations

import pytest
from app.core.config import Settings
from app.main import create_app
from app.modules import ModuleConfigurationError, load_modules, parse_enabled
from httpx import ASGITransport, AsyncClient

API = "/api/v1"
PILOT_ROUTE = "/api/v1/pilot/notes"


def _settings(modules_enabled: str) -> Settings:
    return Settings(modules_enabled=modules_enabled)


def _paths(modules_enabled: str) -> set[str]:
    return set(create_app(_settings(modules_enabled)).openapi()["paths"])


def test_empty_flag_is_core_only() -> None:
    assert parse_enabled("") == ()
    assert load_modules("") == ()
    paths = _paths("")
    assert PILOT_ROUTE not in paths


def test_flag_enables_module_lazily() -> None:
    assert parse_enabled(" pilot , pilot ") == ("pilot",)
    modules = load_modules("pilot")
    assert [module.name for module in modules] == ["pilot"]
    assert PILOT_ROUTE in _paths("pilot")


def test_unknown_module_fails_fast() -> None:
    with pytest.raises(ModuleConfigurationError, match="wiki"):
        load_modules("wiki")


async def test_modules_endpoint_lists_enabled_modules() -> None:
    app = create_app(_settings("pilot"))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"{API}/modules")
    assert response.status_code == 200
    assert response.json() == [{"name": "pilot", "title": "Пилотный модуль"}]


async def test_modules_endpoint_is_empty_without_flags() -> None:
    app = create_app(_settings(""))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"{API}/modules")
    assert response.status_code == 200
    assert response.json() == []
