"""4.1/4.2: учётные записи, сессии и права на диаграмму."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

API = "/api/v1"


def _client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _register(
    app: FastAPI, email: str, *, name: str = "Пользователь", password: str = "password-123"
) -> tuple[AsyncClient, dict[str, Any]]:
    client = _client(app)
    response = await client.post(
        f"{API}/auth/register",
        json={"email": email, "name": name, "password": password},
    )
    assert response.status_code == 201, response.text
    return client, response.json()


async def test_anonymous_requests_are_rejected(auth_app: tuple[FastAPI, AsyncClient]) -> None:
    app, _ = auth_app
    async with _client(app) as anonymous:
        assert (await anonymous.get(f"{API}/diagrams")).status_code == 401
        assert (await anonymous.post(f"{API}/diagrams", json={"title": "x"})).status_code == 401
        assert (await anonymous.get(f"{API}/auth/me")).status_code == 401
        # Health остаётся открытым для проб.
        assert (await anonymous.get(f"{API}/health")).status_code == 200


async def test_register_login_logout(auth_app: tuple[FastAPI, AsyncClient]) -> None:
    app, _ = auth_app
    email = "owner@example.com"
    async with _client(app) as client:
        created = await client.post(
            f"{API}/auth/register",
            json={
                "email": "  Owner@Example.COM ",
                "name": " Владелец ",
                "password": "password-123",
            },
        )
        assert created.status_code == 201, created.text
        user = created.json()
        assert user["email"] == email
        assert user["name"] == "Владелец"
        assert "password" not in user and "password_hash" not in user

        me = await client.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["id"] == user["id"]

        duplicate = await client.post(
            f"{API}/auth/register",
            json={"email": email, "name": "Другой", "password": "password-123"},
        )
        assert duplicate.status_code == 409

        assert (await client.post(f"{API}/auth/logout")).status_code == 204
        assert (await client.get(f"{API}/auth/me")).status_code == 401

        wrong = await client.post(
            f"{API}/auth/login", json={"email": email, "password": "wrong-password"}
        )
        assert wrong.status_code == 401

        login = await client.post(
            f"{API}/auth/login", json={"email": email, "password": "password-123"}
        )
        assert login.status_code == 200
        assert login.json()["id"] == user["id"]


async def test_acl_role_matrix(auth_app: tuple[FastAPI, AsyncClient]) -> None:
    app, _ = auth_app
    owner, _owner_user = await _register(app, "a@example.com", name="Аня")
    viewer, viewer_user = await _register(app, "c@example.com", name="Вера")
    collaborator, collaborator_user = await _register(app, "b@example.com", name="Борис")
    try:
        created = await owner.post(
            f"{API}/diagrams",
            json={"title": "ACL", "bpmn_xml": None},
        )
        assert created.status_code == 201, created.text
        diagram = created.json()
        url = f"{API}/diagrams/{diagram['id']}"

        # Посторонний не видит диаграмму ни в списке, ни по id.
        assert (await collaborator.get(url)).status_code == 403
        listed = (await collaborator.get(f"{API}/diagrams")).json()
        assert diagram["id"] not in [item["id"] for item in listed["items"]]

        async def grant(client: AsyncClient, user_id: str, role: str) -> None:
            response = await client.put(f"{url}/acl/{user_id}", json={"role": role})
            assert response.status_code == 200, response.text

        # Viewer: читает, но не пишет.
        await grant(owner, viewer_user["id"], "viewer")
        assert (await viewer.get(url)).status_code == 200
        assert (await viewer.get(f"{url}/bpmn")).status_code == 200
        assert (
            await viewer.put(
                f"{url}/bpmn",
                content=(await owner.get(f"{url}/bpmn")).text,
                headers={"If-Match": f'"{diagram["etag"]}"', "Content-Type": "application/xml"},
            )
        ).status_code == 403
        assert (await viewer.post(f"{url}/comments", json={"body": "нельзя"})).status_code == 403
        # Viewer не управляет ACL.
        assert (
            await viewer.put(f"{url}/acl/{collaborator_user['id']}", json={"role": "viewer"})
        ).status_code == 403

        # Commenter: комментарии, включая собственные, но не XML.
        await grant(owner, collaborator_user["id"], "commenter")
        spoofed = await collaborator.post(
            f"{url}/comments",
            json={"body": "замечание", "author_id": "a@example.com"},
        )
        assert spoofed.status_code == 201, spoofed.text
        comment = spoofed.json()
        assert comment["author_id"] == collaborator_user["id"]

        # Автор правит свой текст, владелец — тоже; чужой viewer — нет.
        assert (
            await collaborator.patch(f"{url}/comments/{comment['id']}", json={"body": "своё"})
        ).status_code == 200
        assert (
            await owner.patch(f"{url}/comments/{comment['id']}", json={"body": "от владельца"})
        ).status_code == 200
        assert (
            await viewer.patch(f"{url}/comments/{comment['id']}", json={"body": "чужое"})
        ).status_code == 403

        # Editor: сохраняет XML и прогоны, но не удаляет диаграмму и не выдаёт права.
        await grant(owner, collaborator_user["id"], "editor")
        xml = (await collaborator.get(f"{url}/bpmn")).text
        saved = await collaborator.put(
            f"{url}/bpmn",
            content=xml,
            headers={"If-Match": f'"{diagram["etag"]}"', "Content-Type": "application/xml"},
        )
        assert saved.status_code == 200, saved.text
        assert (await collaborator.delete(url)).status_code == 403
        assert (
            await collaborator.put(f"{url}/acl/{viewer_user['id']}", json={"role": "editor"})
        ).status_code == 403

        # Только владелец удаляет.
        assert (await owner.delete(url)).status_code == 204
        assert (await owner.get(url)).status_code == 404
    finally:
        for client in (owner, viewer, collaborator):
            await client.aclose()


async def test_owner_role_cannot_be_granted_or_revoked(
    auth_app: tuple[FastAPI, AsyncClient],
) -> None:
    app, _ = auth_app
    owner, owner_user = await _register(app, "o@example.com")
    other, other_user = await _register(app, "n@example.com")
    try:
        diagram = (await owner.post(f"{API}/diagrams", json={"title": "Owner"})).json()
        url = f"{API}/diagrams/{diagram['id']}/acl"
        assert (
            await owner.put(f"{url}/{owner_user['id']}", json={"role": "viewer"})
        ).status_code == 400
        assert (await owner.delete(f"{url}/{owner_user['id']}")).status_code == 400
        assert (await other.get(f"{API}/diagrams/{diagram['id']}")).status_code == 403
        # Владелец видит себя в списке прав.
        entries = (await owner.get(url)).json()
        assert [entry["user_id"] for entry in entries if entry["is_owner"]] == [owner_user["id"]]
    finally:
        await owner.aclose()
        await other.aclose()


@pytest.mark.parametrize("role", ["viewer", "commenter", "editor"])
async def test_unknown_user_cannot_be_granted(
    auth_app: tuple[FastAPI, AsyncClient], role: str
) -> None:
    app, _ = auth_app
    owner, _ = await _register(app, "grant@example.com")
    try:
        diagram = (await owner.post(f"{API}/diagrams", json={"title": "Grant"})).json()
        response = await owner.put(
            f"{API}/diagrams/{diagram['id']}/acl/missing-user", json={"role": role}
        )
        assert response.status_code == 404
    finally:
        await owner.aclose()
