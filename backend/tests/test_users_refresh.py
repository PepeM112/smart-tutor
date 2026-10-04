"""`POST /users/refresh` clears the auth cookies when it fails, and `UserRead` key flags."""

from __future__ import annotations

from collections.abc import Iterator
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import users
from app.core.security import create_access_token, create_refresh_token
from app.database import get_session
from app.schemas.user import UserRead

URL = "/api/v1/users/refresh"


@pytest.fixture
def client() -> Iterator[TestClient]:
    # Only the users router, not `app.main` (see `test_ai_permissions.py`).
    app = FastAPI()
    app.include_router(users.router, prefix="/api/v1/users")
    app.dependency_overrides[get_session] = lambda: MagicMock()
    yield TestClient(app)


def _cleared_cookies(response_headers: list[str]) -> set[str]:
    """Names of the cookies that the response expires (Max-Age=0)."""
    return {h.split("=", 1)[0] for h in response_headers if "Max-Age=0" in h}


class TestRefreshClearsCookiesOnFailure:
    def test_missing_token(self, client: TestClient) -> None:
        response = client.post(URL)
        assert response.status_code == 401
        assert response.json() == {"detail": "No refresh token"}
        assert _cleared_cookies(response.headers.get_list("set-cookie")) == {"access_token", "refresh_token"}

    def test_invalid_token(self, client: TestClient) -> None:
        client.cookies.set("refresh_token", "garbage")
        response = client.post(URL)
        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid refresh token"}
        assert _cleared_cookies(response.headers.get_list("set-cookie")) == {"access_token", "refresh_token"}

    def test_access_token_is_not_accepted_as_refresh_token(self, client: TestClient) -> None:
        client.cookies.set("refresh_token", create_access_token("u1"))
        assert client.post(URL).status_code == 401

    def test_user_not_found(self, client: TestClient) -> None:
        client.cookies.set("refresh_token", create_refresh_token("gone"))
        with patch("app.services.user_service.user_crud.get_by_id", return_value=None):
            response = client.post(URL)
        assert response.status_code == 401
        assert response.json() == {"detail": "User not found"}
        assert _cleared_cookies(response.headers.get_list("set-cookie")) == {"access_token", "refresh_token"}


class TestRefreshSuccess:
    def test_sets_new_cookies(self, client: TestClient) -> None:
        user = SimpleNamespace(
            id="u1", username="u", email="u@example.com", status=1, role=1, encrypted_anthropic_key=None
        )
        client.cookies.set("refresh_token", create_refresh_token("u1"))
        with patch("app.services.user_service.user_crud.get_by_id", return_value=user):
            response = client.post(URL)
        assert response.status_code == 200
        cookies = response.headers.get_list("set-cookie")
        assert {c.split("=", 1)[0] for c in cookies} == {"access_token", "refresh_token"}
        assert _cleared_cookies(cookies) == set()


class _OrmLike:
    """Reads the key through a property, so it is not in `vars(obj)`."""

    id = "u1"
    username = "u"
    email = "u@example.com"
    status = 1
    role = 1

    @property
    def encrypted_openai_key(self) -> str:
        return "secret"


class TestUserReadKeyFlags:
    def test_flags_come_from_attributes_that_vars_does_not_show(self) -> None:
        read = UserRead.model_validate(_OrmLike())
        assert read.has_openai_key is True
        assert read.has_anthropic_key is False

    def test_dict_input_is_not_mutated(self) -> None:
        data: dict[str, object] = {
            "id": "u1",
            "username": "u",
            "email": "u@example.com",
            "status": 1,
            "role": 1,
            "encrypted_anthropic_key": "x",
        }
        before = dict(data)
        assert UserRead.model_validate(data).has_anthropic_key is True
        assert data == before
