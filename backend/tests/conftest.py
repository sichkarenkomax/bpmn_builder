"""Общие фикстуры тестов."""

from collections.abc import AsyncIterator

import pytest
from app.api.deps import get_session
from app.core.config import Settings
from app.db.base import Base
from app.main import create_app
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _settings(request: pytest.FixtureRequest) -> Settings:
    """Модули включаются непрямой параметризацией: `["pilot"]` → `pilot`."""
    enabled = getattr(request, "param", ())
    return Settings(modules_enabled=",".join(enabled))


@pytest.fixture
async def client(request: pytest.FixtureRequest) -> AsyncIterator[AsyncClient]:
    app = create_app(_settings(request))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.fixture
async def db_client(request: pytest.FixtureRequest) -> AsyncIterator[AsyncClient]:
    """Клиент с настоящей БД (SQLite в памяти) и подменённой сессией."""
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app = create_app(_settings(request))
    app.dependency_overrides[get_session] = override_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    await engine.dispose()
