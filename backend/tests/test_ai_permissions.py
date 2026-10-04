"""Tests for the approval policy of the assistant tools (read/write defaults + per-user overrides).

Covers the policy function, the permissions service, the two endpoints (mocked DB session) and
that the assistant loop pauses for a write tool until the user has an override.

Run:  pytest tests/test_ai_permissions.py
"""

from __future__ import annotations

from collections.abc import Generator, Iterator
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.v1.endpoints import users
from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.assist import AssistMessage, AssistRequest
from app.schemas.user import AiToolPermissionsUpdate
from app.services import ai_permission_service
from app.services.ai_permission_service import needs_confirmation
from app.services.assist_service import stream_assist
from app.services.assist_tools import TOOLS
from app.services.llm import StreamResult, TextDelta, ToolCallDelta

ASSIST = "app.services.assist_service"


def _user(permissions: dict[str, bool] | None = None) -> User:
    # Transient ORM object: the policy only reads `ai_tool_permissions`.
    return User(id="u1", username="u", email="u@example.com", hashed_password="x", ai_tool_permissions=permissions)


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------


class TestNeedsConfirmation:
    def test_new_user_read_tools_run_and_write_tools_ask(self) -> None:
        user = _user({})
        for name, spec in TOOLS.items():
            assert needs_confirmation(user, name) is (spec.kind == "write")

    def test_a_null_map_uses_the_defaults(self) -> None:
        assert needs_confirmation(_user(None), "create_note") is True
        assert needs_confirmation(_user(None), "list_notes") is False

    def test_override_true_lets_a_write_tool_run(self) -> None:
        assert needs_confirmation(_user({"create_note": True}), "create_note") is False

    def test_override_false_makes_a_read_tool_ask(self) -> None:
        assert needs_confirmation(_user({"list_notes": False}), "list_notes") is True

    def test_an_override_only_changes_its_own_tool(self) -> None:
        assert needs_confirmation(_user({"create_note": True}), "create_test") is True

    def test_unknown_tool_never_asks(self) -> None:
        # An unknown tool is never run: execute_tool answers "Unknown tool".
        assert needs_confirmation(_user({"nope": False}), "nope") is False

    def test_unknown_names_and_junk_values_in_the_map_are_ignored(self) -> None:
        user = _user({"removed_tool": True, "create_note": "yes"})  # type: ignore[dict-item]
        assert needs_confirmation(user, "create_note") is True
        assert needs_confirmation(user, "list_notes") is False


class TestListPermissions:
    def test_lists_every_tool_in_registry_order(self) -> None:
        rows = ai_permission_service.list_permissions(_user({}))
        assert [r.name for r in rows] == list(TOOLS)
        assert all(r.default_auto_approve is (r.kind == "read") for r in rows)
        assert all(r.auto_approve is r.default_auto_approve for r in rows)

    def test_override_shows_in_auto_approve_but_not_in_the_default(self) -> None:
        row = next(
            r for r in ai_permission_service.list_permissions(_user({"create_note": True})) if r.name == "create_note"
        )
        assert (row.kind, row.default_auto_approve, row.auto_approve) == ("write", False, True)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class TestUpdatePermissions:
    def test_merges_into_the_existing_map(self) -> None:
        user = _user({"create_note": True})
        db = MagicMock()
        rows = ai_permission_service.update_permissions(
            db, current_user=user, data=AiToolPermissionsUpdate(permissions={"create_test": True})
        )
        assert user.ai_tool_permissions == {"create_note": True, "create_test": True}
        db.commit.assert_called_once()
        assert {r.name for r in rows if r.auto_approve and r.kind == "write"} == {"create_note", "create_test"}

    def test_unknown_tool_is_rejected_and_nothing_is_saved(self) -> None:
        user = _user({})
        db = MagicMock()
        with pytest.raises(HTTPException) as exc:
            ai_permission_service.update_permissions(
                db, current_user=user, data=AiToolPermissionsUpdate(permissions={"create_note": True, "nope": True})
            )
        assert exc.value.status_code == 422
        assert "nope" in str(exc.value.detail)
        assert user.ai_tool_permissions == {}
        db.commit.assert_not_called()

    def test_stale_names_are_dropped_on_save(self) -> None:
        user = _user({"removed_tool": True})
        ai_permission_service.update_permissions(
            MagicMock(), current_user=user, data=AiToolPermissionsUpdate(permissions={"create_note": True})
        )
        assert user.ai_tool_permissions == {"create_note": True}

    def test_empty_body_changes_nothing(self) -> None:
        user = _user({"create_note": True})
        db = MagicMock()
        ai_permission_service.update_permissions(db, current_user=user, data=AiToolPermissionsUpdate())
        db.commit.assert_not_called()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@pytest.fixture
def api_user() -> User:
    return _user({})


def _app() -> FastAPI:
    # Only the users router, not `app.main`: importing it turns off log propagation for the whole
    # test session, and `caplog` tests in other files would fail.
    app = FastAPI()
    app.include_router(users.router, prefix="/api/v1/users")
    return app


@pytest.fixture
def client(api_user: User) -> Iterator[TestClient]:
    app = _app()
    app.dependency_overrides[get_session] = lambda: MagicMock()
    app.dependency_overrides[get_current_user] = lambda: api_user
    yield TestClient(app)


class TestEndpoints:
    URL = "/api/v1/users/me/ai-tool-permissions"

    def test_get_returns_every_tool_with_camel_case_keys(self, client: TestClient) -> None:
        response = client.get(self.URL)
        assert response.status_code == 200
        rows = response.json()
        assert [r["name"] for r in rows] == list(TOOLS)
        assert set(rows[0]) == {"name", "kind", "defaultAutoApprove", "autoApprove"}

    def test_patch_saves_and_returns_the_new_state(self, client: TestClient, api_user: User) -> None:
        response = client.patch(self.URL, json={"permissions": {"create_note": True}})
        assert response.status_code == 200
        row = next(r for r in response.json() if r["name"] == "create_note")
        assert (row["defaultAutoApprove"], row["autoApprove"]) == (False, True)
        assert api_user.ai_tool_permissions == {"create_note": True}

    def test_patch_with_an_unknown_tool_is_422(self, client: TestClient) -> None:
        response = client.patch(self.URL, json={"permissions": {"nope": True}})
        assert response.status_code == 422

    def test_both_endpoints_need_a_logged_in_user(self) -> None:
        anonymous = TestClient(_app())
        assert anonymous.get(self.URL).status_code == 401
        assert anonymous.patch(self.URL, json={"permissions": {}}).status_code == 401


# ---------------------------------------------------------------------------
# Assistant loop
# ---------------------------------------------------------------------------


class _FakeLLM:
    """Returns one scripted `StreamResult` per round, as `LLMClient.stream_with_tools` does."""

    def __init__(self, *rounds: StreamResult) -> None:
        self._rounds = iter(rounds)

    def stream_with_tools(self, **_: object) -> Generator[TextDelta, None, StreamResult]:
        result = next(self._rounds)
        yield TextDelta("ok")
        return result


def _tool_round(name: str) -> StreamResult:
    call = ToolCallDelta(id="tc1", name=name, arguments={"topic": "Cells"})
    return StreamResult(stop_reason="tool_use", text="", tool_calls=[call])


def _events(chunks: Generator[str, None, None]) -> list[str]:
    return [
        line.removeprefix("event: ") for chunk in chunks for line in chunk.splitlines() if line.startswith("event: ")
    ]


def _run_loop(user: User, tool: str) -> tuple[list[str], MagicMock]:
    llm = _FakeLLM(_tool_round(tool), StreamResult(stop_reason="end_turn", text="done"))
    request = AssistRequest(messages=[AssistMessage(role="user", content="hi")])
    with (
        patch(f"{ASSIST}.get_user_llm_client", return_value=llm),
        patch(f"{ASSIST}.build_confirm_context", return_value={"summary": [{"key": "topic", "value": "Cells"}]}),
        patch(f"{ASSIST}.execute_tool") as execute,
    ):
        execute.return_value = MagicMock(output="Note created", metadata=None)
        events = _events(stream_assist(MagicMock(), current_user=user, request=request))
    return events, execute


class TestAssistLoopPolicy:
    def test_write_tool_pauses_for_a_new_user(self) -> None:
        events, execute = _run_loop(_user({}), "create_note")
        assert "confirm_required" in events
        assert "tool_result" not in events
        execute.assert_not_called()

    def test_write_tool_runs_after_an_override(self) -> None:
        events, execute = _run_loop(_user({"create_note": True}), "create_note")
        assert "confirm_required" not in events
        execute.assert_called_once()

    def test_read_tool_runs_without_a_card(self) -> None:
        events, execute = _run_loop(_user({}), "list_notes")
        assert "confirm_required" not in events
        execute.assert_called_once()

    def test_turning_the_override_off_brings_the_card_back(self) -> None:
        events, _ = _run_loop(_user({"create_note": False}), "create_note")
        assert "confirm_required" in events
