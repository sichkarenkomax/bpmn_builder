"""Сборка приложения."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import acl, auth, comments, diagrams, exports, health, modules, simulation
from app.core.config import Settings, get_settings
from app.core.db import dispose_engine
from app.core.middleware import (
    BodySizeLimitMiddleware,
    RateLimitMiddleware,
    RequestTimeoutMiddleware,
    SecurityHeadersMiddleware,
)
from app.export.jobs import export_jobs
from app.modules import load_modules


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await export_jobs.stop()
    await dispose_engine()


def create_app(settings: Settings | None = None) -> FastAPI:
    """Фабрика приложения: нужна тестам и uvicorn-у.

    `settings` можно передать явно — так тесты проверяют разные
    `MODULES_ENABLED` без правки окружения.
    """
    settings = settings or get_settings()
    app = FastAPI(
        title="BPMN Studio API",
        version=settings.app_version,
        docs_url="/docs" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    app.add_middleware(
        RequestTimeoutMiddleware,
        seconds=settings.request_timeout_seconds,
    )
    app.add_middleware(
        BodySizeLimitMiddleware,
        limit=settings.max_request_body_bytes,
    )
    app.add_middleware(
        RateLimitMiddleware,
        per_minute=settings.rate_limit_per_minute,
        write_per_minute=settings.rate_limit_write_per_minute,
        trust_proxy=settings.trust_proxy_headers,
        enabled=settings.rate_limit_enabled,
    )
    app.add_middleware(
        SecurityHeadersMiddleware,
        hsts=settings.environment == "production",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(diagrams.router, prefix=settings.api_prefix)
    app.include_router(acl.router, prefix=settings.api_prefix)
    app.include_router(comments.router, prefix=settings.api_prefix)
    app.include_router(exports.router, prefix=settings.api_prefix)
    app.include_router(simulation.router, prefix=settings.api_prefix)
    # Модули подключаются после ядра и не меняют его роуты (ADR-006).
    # Список берётся из MODULES_ENABLED; выключенный модуль не импортируется.
    enabled = load_modules(settings.modules_enabled)
    app.state.modules = enabled
    app.include_router(modules.router, prefix=settings.api_prefix)
    for module in enabled:
        app.include_router(module.router, prefix=settings.api_prefix)
    return app


app = create_app()
