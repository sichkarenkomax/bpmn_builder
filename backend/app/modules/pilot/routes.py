"""HTTP-контракт пилотного модуля: `/api/v1/pilot/...`, без правок ядра."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.contracts import get_session
from app.modules.pilot import service
from app.modules.pilot.schemas import NoteCreate, NoteRead

router = APIRouter(prefix="/pilot", tags=["pilot"])


@router.get("/notes", response_model=list[NoteRead])
async def list_notes(session: AsyncSession = Depends(get_session)) -> list[NoteRead]:
    notes = await service.list_notes(session)
    return [NoteRead.model_validate(note) for note in notes]


@router.post("/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreate,
    session: AsyncSession = Depends(get_session),
) -> NoteRead:
    if not payload.title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="пустой заголовок")
    note = await service.create_note(session, payload)
    return NoteRead.model_validate(note)


@router.get("/notes/{note_id}", response_model=NoteRead)
async def read_note(
    note_id: str,
    session: AsyncSession = Depends(get_session),
) -> NoteRead:
    note = await service.get_note(session, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="заметка не найдена")
    return NoteRead.model_validate(note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    if not await service.delete_note(session, note_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="заметка не найдена")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
