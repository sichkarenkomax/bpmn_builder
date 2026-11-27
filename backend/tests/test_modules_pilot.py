"""4.0.2: пилотный модуль живёт по контракту ядра и проходит CRUD."""

from __future__ import annotations

from app.modules import MODULES
from app.modules.pilot.models import PilotNote
from httpx import AsyncClient

API = "/api/v1"


def test_module_contract_and_table_prefix() -> None:
    assert [module.name for module in MODULES] == ["pilot"]
    pilot = MODULES[0]
    assert pilot.table_prefix == "pilot_"
    assert PilotNote.__tablename__.startswith(pilot.table_prefix)
    assert pilot.router.prefix == "/pilot"


async def test_pilot_notes_crud(db_client: AsyncClient) -> None:
    created = await db_client.post(
        f"{API}/pilot/notes",
        json={"title": "  Первая заметка  ", "body": "  текст  "},
    )
    assert created.status_code == 201, created.text
    note = created.json()
    assert note["title"] == "Первая заметка"
    assert note["body"] == "текст"
    assert note["created_at"]

    listed = await db_client.get(f"{API}/pilot/notes")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [note["id"]]

    fetched = await db_client.get(f"{API}/pilot/notes/{note['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Первая заметка"

    deleted = await db_client.delete(f"{API}/pilot/notes/{note['id']}")
    assert deleted.status_code == 204
    assert (await db_client.get(f"{API}/pilot/notes/{note['id']}")).status_code == 404
    assert (await db_client.delete(f"{API}/pilot/notes/{note['id']}")).status_code == 404
    assert (await db_client.get(f"{API}/pilot/notes")).json() == []


async def test_pilot_rejects_blank_title(db_client: AsyncClient) -> None:
    blank = await db_client.post(f"{API}/pilot/notes", json={"title": "   "})
    assert blank.status_code == 400
    empty = await db_client.post(f"{API}/pilot/notes", json={"title": ""})
    assert empty.status_code == 422
