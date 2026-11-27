"""Список включённых модулей: frontend узнаёт о них без пересборки (4.0.4)."""

from __future__ import annotations

from app.core.contracts import ModuleSpec
from app.schemas.module import ModuleInfo
from fastapi import APIRouter, Request

router = APIRouter(tags=["modules"])


@router.get("/modules", response_model=list[ModuleInfo], summary="Включённые модули")
async def list_modules(request: Request) -> list[ModuleInfo]:
    modules: tuple[ModuleSpec, ...] = getattr(request.app.state, "modules", ())
    return [ModuleInfo(name=module.name, title=module.title) for module in modules]
