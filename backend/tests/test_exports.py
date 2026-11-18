"""Экспорт: JSON, CSV, XLSX, DOCX и PDF из сохранённой диаграммы."""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from PIL import Image

API = "/api/v1"
FIXTURES = Path(__file__).parent / "fixtures" / "bpmn"


@pytest.fixture
def sample_xml() -> str:
    return (FIXTURES / "camunda-simple.bpmn").read_text(encoding="utf-8")


async def _diagram(client: AsyncClient, xml: str) -> dict[str, Any]:
    response = await client.post(
        f"{API}/diagrams", json={"title": "Экспорт процесса", "bpmn_xml": xml}
    )
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _png() -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (800, 600), "white").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


async def test_json_export_contains_model(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _diagram(db_client, sample_xml)

    response = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/exports/json", json={"xml": sample_xml}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["processes"]
    assert payload["processes"][0]["nodes"]
    assert "attachment" in response.headers["content-disposition"]


async def test_json_can_be_imported_back_to_bpmn(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _diagram(db_client, sample_xml)
    exported = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/exports/json", json={"xml": sample_xml}
    )

    imported = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/imports/json", json=exported.json()
    )

    assert imported.status_code == 200, imported.text
    assert imported.headers["content-type"].startswith("application/xml")
    assert "bpmn:definitions" in imported.text
    assert "Process_" in imported.text


async def test_csv_export_has_bom_and_rows(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _diagram(db_client, sample_xml)

    response = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/exports/csv", json={"xml": sample_xml}
    )

    assert response.status_code == 200
    assert response.content.startswith(b"\xef\xbb\xbf")
    text = response.content.decode("utf-8-sig")
    assert "Процесс,Тип,ID" in text
    assert "sequenceFlow" in text


async def test_xlsx_and_docx_are_zip_containers(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _diagram(db_client, sample_xml)

    for fmt in ("xlsx", "docx"):
        response = await db_client.post(
            f"{API}/diagrams/{diagram['id']}/exports/{fmt}", json={"xml": sample_xml}
        )
        assert response.status_code == 200, response.text
        assert response.content.startswith(b"PK")


async def test_pdf_export_wraps_canvas(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _diagram(db_client, sample_xml)

    response = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/exports/pdf",
        json={"xml": sample_xml, "png_base64": _png(), "page": "A4", "orientation": "landscape"},
    )

    assert response.status_code == 200, response.text
    assert response.content.startswith(b"%PDF")
    assert response.headers["content-type"] == "application/pdf"


async def test_pdf_requires_png(db_client: AsyncClient, sample_xml: str) -> None:
    diagram = await _diagram(db_client, sample_xml)

    response = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/exports/pdf", json={"xml": sample_xml}
    )

    assert response.status_code == 400


async def test_export_rejects_invalid_xml(db_client: AsyncClient) -> None:
    diagram = await _diagram(
        db_client,
        (FIXTURES / "bpmnjs-empty.bpmn").read_text(encoding="utf-8"),
    )

    response = await db_client.post(
        f"{API}/diagrams/{diagram['id']}/exports/json",
        json={"xml": "<bpmn:definitions/>"},
    )

    assert response.status_code == 400


async def test_export_unknown_diagram_returns_404(db_client: AsyncClient, sample_xml: str) -> None:
    response = await db_client.post(f"{API}/diagrams/nope/exports/json", json={"xml": sample_xml})
    assert response.status_code == 404
