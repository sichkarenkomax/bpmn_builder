"""Сервис пилотного модуля: работает со своей таблицей, ядро не трогает."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.pilot.models import PilotNote
from app.modules.pilot.schemas import NoteCreate


async def list_notes(session: AsyncSession) -> Sequence[PilotNote]:
    rows = await session.scalars(select(PilotNote).order_by(PilotNote.created_at))
    return list(rows)


async def get_note(session: AsyncSession, note_id: str) -> PilotNote | None:
    return await session.get(PilotNote, note_id)


async def create_note(session: AsyncSession, payload: NoteCreate) -> PilotNote:
    note = PilotNote(title=payload.title.strip(), body=payload.body.strip())
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return note


async def delete_note(session: AsyncSession, note_id: str) -> bool:
    note = await session.get(PilotNote, note_id)
    if note is None:
        return False
    await session.delete(note)
    await session.commit()
    return True


__all__ = ["create_note", "delete_note", "get_note", "list_notes"]
