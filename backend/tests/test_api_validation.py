"""API валидации: POST /validate, лимиты, заголовки PUT и DOCX-отчёт (2.2, 2.4.2)."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import pytest
from app.core.config import get_settings
from docx import Document as DocxDocument
from httpx import AsyncClient

API = "/api/v1"
FIXTURES = Path(__file__).parent / "fixtures" / "bpmn"


def gateway_errors_xml() -> str:
    return (FIXTURES / "gateway-errors.bpmn").read_text(encoding="utf-8")


async def _create(client: AsyncClient, xml: str) -> dict[str, Any]:
    response = await client.post(
        f"{API}/diagrams", json={"title": "Проверка шлюзов", "bpmn_xml": xml}
    )
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def test_post_validate_returns_report_and_does_not_create_version(
    db_client: AsyncClient,
) -> None:
    diagram = await _create(db_client, gateway_errors_xml())
    before = (await db_client.get(f"{API}/diagrams/{diagram['id']}/versions")).json()

    response = await db_client.post(f"{API}/diagrams/{diagram['id']}/validate")

    assert response.status_code == 200
    report = response.json()
    assert report["valid"] is False
    assert report["schema_version"] == "1.0"
    assert report["config_errors"] == []
    codes = {item["rule_id"] for item in report["findings"]}
    assert "BPMN-GATEWAY-001" in codes
    assert "BPMN-GATEWAY-002" in codes
    after = (await db_client.get(f"{API}/diagrams/{diagram['id']}/versions")).json()
    assert len(after) == len(before)


async def test_include_limits_rule_categories(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, gateway_errors_xml())

    response = await db_client.post(f"{API}/diagrams/{diagram['id']}/validate?include=structure")

    assert response.status_code == 200
    assert response.json()["findings"] == []
    unknown = await db_client.post(f"{API}/diagrams/{diagram['id']}/validate?include=magic")
    assert unknown.status_code == 400
    assert unknown.json()["detail"]["code"] == "UnknownValidationCategory"


async def test_post_validate_missing_diagram_is_404(db_client: AsyncClient) -> None:
    response = await db_client.post(f"{API}/diagrams/nope/validate")

    assert response.status_code == 404


async def test_broken_saved_xml_returns_xsd_finding(
    db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    diagram = await _create(db_client, gateway_errors_xml())

    async def broken(_session: object, _diagram: object) -> str:
        return "<bpmn:definitions/>"

    monkeypatch.setattr("app.api.routes.diagrams._current_xml", broken)

    response = await db_client.post(f"{API}/diagrams/{diagram['id']}/validate")

    assert response.status_code == 200
    report = response.json()
    assert report["valid"] is False
    assert report["findings"][0]["rule_id"] == "BPMN-XSD-001"
    assert report["findings"][0]["line"] is not None


async def test_stored_oversized_xml_is_413(
    db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    diagram = await _create(db_client, gateway_errors_xml())
    monkeypatch.setattr("app.api.routes.diagrams.MAX_XML_BYTES", 32)

    response = await db_client.post(f"{API}/diagrams/{diagram['id']}/validate")

    assert response.status_code == 413


async def test_validate_is_rate_limited(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, gateway_errors_xml())

    # Лимит зависит от окружения (.env, CI): проверяем фактический порог, а не 120.
    limit = get_settings().rate_limit_write_per_minute
    statuses: list[int] = []
    for _ in range(limit + 5):
        response = await db_client.post(f"{API}/diagrams/{diagram['id']}/validate")
        statuses.append(response.status_code)
        if response.status_code == 429:
            break

    assert 429 in statuses
    limited = await db_client.post(f"{API}/diagrams/{diagram['id']}/validate")
    assert limited.status_code == 429
    assert limited.headers["retry-after"]


async def test_put_returns_validation_headers(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, gateway_errors_xml())

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=gateway_errors_xml(),
        headers={"content-type": "application/xml", "If-Match": f'"{diagram["etag"]}"'},
    )

    assert response.status_code == 200
    assert int(response.headers["X-Validation-Errors"]) >= 1
    assert int(response.headers["X-Validation-Warnings"]) >= 1


async def test_put_still_saves_with_validation_errors(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, gateway_errors_xml())
    changed = gateway_errors_xml().replace('name="Ветка B"', 'name="Ветка B2"')

    response = await db_client.put(
        f"{API}/diagrams/{diagram['id']}/bpmn",
        content=changed,
        headers={"content-type": "application/xml", "If-Match": f'"{diagram["etag"]}"'},
    )

    assert response.status_code == 200
    saved = await db_client.get(f"{API}/diagrams/{diagram['id']}/bpmn")
    assert "Ветка B2" in saved.text


async def test_docx_report_contains_findings(db_client: AsyncClient) -> None:
    diagram = await _create(db_client, gateway_errors_xml())

    response = await db_client.get(f"{API}/diagrams/{diagram['id']}/validation/report.docx")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert response.content.startswith(b"PK")
    document = DocxDocument(io.BytesIO(response.content))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    table_text = "\n".join(
        cell.text for table in document.tables for row in table.rows for cell in row.cells
    )
    assert "Отчёт о проверке процесса" in text
    assert "Проверка шлюзов" in text
    assert "BPMN-GATEWAY-001" in table_text


async def test_openapi_documents_validate_contract(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "/api/v1/diagrams/{diagram_id}/validate" in schema["paths"]
    operation = schema["paths"]["/api/v1/diagrams/{diagram_id}/validate"]["post"]
    assert operation["summary"].strip()
    example = operation["responses"]["200"]["content"]["application/json"]["example"]
    assert example["schema_version"] == "1.0"
    assert "429" in operation["responses"]
