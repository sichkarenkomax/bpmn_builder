"""Сборка приложения."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import comments, diagrams, exports, health
from app.core.config import get_settings
from app.core.db import dispose_engine
from app.core.middleware import (
    BodySizeLimitMiddleware,
    RateLimitMiddleware,
    RequestTimeoutMiddleware,
    SecurityHeadersMiddleware,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    """Фабрика приложения: нужна тестам и uvicorn-у."""
    settings = get_settings()
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
    app.include_router(diagrams.router, prefix=settings.api_prefix)
    app.include_router(comments.router, prefix=settings.api_prefix)
    app.include_router(exports.router, prefix=settings.api_prefix)
    return app


app = create_app()
