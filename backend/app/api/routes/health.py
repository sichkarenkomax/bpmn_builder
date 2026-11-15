"""Эндпоинты проверки живости и готовности."""

from app.core.checks import check_cache, check_database
from app.core.config import Settings
from app.schemas.health import DependencyStatus, HealthResponse, ReadinessResponse
from fastapi import APIRouter, Response, status

router = APIRouter(tags=["health"])


def _settings() -> Settings:
    from app.core.config import get_settings

    return get_settings()


@router.get("/health", summary="Liveness-проба")
async def liveness() -> HealthResponse:
    settings = _settings()
    return HealthResponse(
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )


@router.get(
    "/health/ready",
    summary="Readiness-проба: БД и Redis",
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessResponse}},
)
async def readiness(response: Response) -> ReadinessResponse:
    database = await check_database()
    cache = await check_cache()

    dependencies = {
        "database": DependencyStatus(
            status="up" if database.ok else "down",
            latency_ms=database.latency_ms,
            detail=database.detail,
        ),
        "cache": DependencyStatus(
            status="up" if cache.ok else "down",
            latency_ms=cache.latency_ms,
            detail=cache.detail,
        ),
    }
    healthy = database.ok and cache.ok
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadinessResponse(status="ok" if healthy else "degraded", dependencies=dependencies)
