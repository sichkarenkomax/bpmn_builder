"""API диаграмм: создание, чтение XML, версии, конфликты, ошибки."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

API = "/api/v1"
FIXTURES = Path(__file__).parent / "fixtures" / "bpmn"


@pytest.fixture
def sample_xml() -> str:
    return (FIXTURES / "camunda-simple.bpmn").read_text(encoding="utf-8")


async def _create(
    client: AsyncClient, title: str = "Процесс", xml: str | None = None
) -> dict[str, Any]:
    payload: dict[str, str] = {"title": title}
    if xml is not None:
        payload["bpmn_xml"] = xml
    response = await client.post(f"{API}/diagrams", json=payload)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def test_create_empty_diagram_generates_valid_bpmn(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, "Пустая")

    assert diagram["title"] == "Пустая"
    assert diagram["status"] == "draft"
    assert diagram["etag"]

    xml = (await db_client.get(f"{API}/diagrams/{diagram['id']}/bpmn")).text
    assert "bpmn:definitions" in xml
    assert 'id="Process_1"' in xml


async def test_create_with_xml_keeps_it_byte_for_byte(
    db_client: AsyncClient, sample_xml: str
) -> None:
    diagram = await _create(db_client, "Camunda", sample_xml)

    response = await db_client.get(f"{API}/diagrams/{diagram['id']}/bpmn")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    assert response.text == sample_xml
    assert response.headers["etag"] == f'"{diagram["etag"]}"'


async def test_validation_returns_report_for_saved_diagram(
    db_client: AsyncClient, sample_xml: str
) -> None:
    diagram = await _create(db_client, "С проверкой", sample_xml)

    response = await db_client.get(f"{API}/diagrams/{diagram['id']}/validation")

    assert response.status_code == 200
    report = response.json()
    assert report["schema_version"] == "1.0"
    assert report["valid"] is True
    assert report["summary"] == {"errors": 0, "warnings": 0, "infos": 0}
    assert report["findings"] == []
    assert report["duration_ms"] >= 0


async def test_validation_missing_diagram_is_404(db_client: AsyncClient) -> None:
    response = await db_client.get(f"{API}/diagrams/nope/validation")

    assert response.status_code == 404


async def test_create_rejects_invalid_xml(db_client: AsyncClient) -> None:
    response = await db_client.post(
        f"{API}/diagrams",
        json={"title": "Плохая", "bpmn_xml": "<bpmn:definitions/>"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] in {"BpmnSchemaError", "BpmnSyntaxError"}
    assert detail["message"]


async def test_create_rejects_doctype_and_entities(db_client: AsyncClient) -> None:
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE definitions [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"'
        ' id="D" targetNamespace="http://x"><bpmn:process id="P">&xxe;</bpmn:process>'
        "</bpmn:definitions>"
    )

    response = await db_client.post(f"{API}/diagrams", json={"title": "XXE", "bpmn_xml": xml})

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "BpmnSyntaxError"


async def test_create_rejects_oversized_xml(
    db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.routes.diagrams.MAX_XML_BYTES", 100)

    response = await db_client.post(
        f"{API}/diagrams", json={"title": "Большая", "bpmn_xml": "x" * 200}
    )

    assert response.status_code == 413


async def test_put_requires_if_match(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _create(db_client, "Без предусловия")

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=sample_xml.encode(),
    )

    assert response.status_code == 428
    assert response.json()["detail"]["code"] == "IfMatchRequired"


async def test_put_rejects_oversized_content_length(
    db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    diagram = await _create(db_client, "Большое тело")
    monkeypatch.setattr("app.api.routes.diagrams.MAX_XML_BYTES", 100)

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=b"x" * 200,
        headers={"If-Match": f'"{diagram["etag"]}"'},
    )

    assert response.status_code == 413


async def test_put_rejects_oversized_stream_without_content_length(
    db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    diagram = await _create(db_client, "Поток")
    monkeypatch.setattr("app.api.routes.diagrams.MAX_XML_BYTES", 100)

    async def chunks() -> AsyncIterator[bytes]:
        yield b"x" * 60
        yield b"x" * 60

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=chunks(),
        headers={"If-Match": f'"{diagram["etag"]}"'},
    )

    assert response.status_code == 413


async def test_put_rejects_non_utf8_body(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, "Кодировка")

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=b"\xff\xfe<bpmn:definitions",
        headers={"If-Match": f'"{diagram["etag"]}"', "content-type": "application/xml"},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "BpmnSyntaxError"


async def test_put_creates_new_version(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _create(db_client, "Версии")
    first_etag = diagram["etag"]

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=sample_xml.encode(),
        headers={
            "If-Match": f'"{diagram["etag"]}"',
            "content-type": "application/xml",
        },
    )

    assert response.status_code == 200
    saved = response.json()
    assert saved["etag"] != first_etag

    versions = (await db_client.get(f"{API}/diagrams/{diagram['id']}/versions")).json()
    assert len(versions) == 2
    assert versions[0]["message"] is None


async def test_put_same_xml_does_not_create_version(
    db_client: AsyncClient, sample_xml: str
) -> None:
    diagram = await _create(db_client, "Идемпотентность", sample_xml)

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=sample_xml.encode(),
        headers={"If-Match": f'"{diagram["etag"]}"'},
    )

    assert response.status_code == 200
    assert response.json()["etag"] == diagram["etag"]
    versions = (await db_client.get(f"{API}/diagrams/{diagram['id']}/versions")).json()
    assert len(versions) == 1


async def test_put_with_stale_etag_conflicts(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _create(db_client, "Конфликт")

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=sample_xml.encode(),
        headers={"If-Match": '"deadbeef"'},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "EtagMismatch"


async def test_put_invalid_xml_returns_position(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, "Ошибка")

    broken = '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">'
    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=broken.encode(),
        headers={"If-Match": f'"{diagram["etag"]}"'},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["line"] is not None


async def test_list_update_delete(db_client: AsyncClient) -> None:
    first = await _create(db_client, "Первая")
    await _create(db_client, "Вторая")

    listing = (await db_client.get(f"{API}/diagrams?limit=1")).json()
    assert listing["total"] == 2
    assert len(listing["items"]) == 1

    patched = await db_client.patch(
        f"{API}/diagrams/{first['id']}", json={"title": "Переименована", "status": "approved"}
    )
    assert patched.json()["title"] == "Переименована"
    assert patched.json()["status"] == "approved"

    deleted = await db_client.delete(f"{API}/diagrams/{first['id']}")
    assert deleted.status_code == 204
    assert (await db_client.get(f"{API}/diagrams/{first['id']}")).status_code == 404


async def test_description_can_be_set_cleared_and_kept(db_client: AsyncClient) -> None:
    response = await db_client.post(
        f"{API}/diagrams", json={"title": "С описанием", "description": "Заявки из CRM"}
    )
    assert response.status_code == 201
    created = response.json()
    assert created["description"] == "Заявки из CRM"

    kept = await db_client.patch(f"{API}/diagrams/{created['id']}", json={"title": "Новое имя"})
    assert kept.json()["description"] == "Заявки из CRM"

    changed = await db_client.patch(
        f"{API}/diagrams/{created['id']}", json={"description": "Новая редакция"}
    )
    assert changed.json()["description"] == "Новая редакция"

    cleared = await db_client.patch(f"{API}/diagrams/{created['id']}", json={"description": ""})
    assert cleared.json()["description"] is None

    listed = (await db_client.get(f"{API}/diagrams")).json()
    assert listed["items"][0]["description"] is None


async def test_unknown_diagram_returns_404(db_client: AsyncClient) -> None:
    assert (await db_client.get(f"{API}/diagrams/nope")).status_code == 404
    assert (await db_client.get(f"{API}/diagrams/nope/bpmn")).status_code == 404
    assert (await db_client.get(f"{API}/diagrams/nope/versions")).status_code == 404
