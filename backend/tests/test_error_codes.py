"""Each coded error site sends the expected `code`, and a plain `HTTPException` keeps the `{"detail"}` body.

The services run with mocked CRUD calls (no DB, no network).

Run:  pytest tests/test_error_codes.py
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import InvalidToken
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.enums import AttemptStatus, FeedPermission, SpaceItemKind, SpaceKind, SpaceRole
from app.core.errors import AppError, app_error_handler
from app.schemas.error import ErrorCode
from app.schemas.space import ClassroomSettingsUpdate
from app.services import (
    assist_service,
    challenge_service,
    classroom_service,
    grade_override_service,
    llm,
    space_attempt_service,
    space_draft_service,
    space_feed_service,
    space_service,
)
from app.services.llm import AIKeyError

AT = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)


def _error_of(call: Any, *args: Any, **kwargs: Any) -> HTTPException:
    with pytest.raises(HTTPException) as exc_info:
        call(*args, **kwargs)
    return exc_info.value


def _assert_coded(error: HTTPException, *, status: int, code: ErrorCode) -> AppError:
    assert isinstance(error, AppError)
    assert error.status_code == status
    assert error.body.code == code
    return error


# ── The handler ───────────────────────────────────────────────────────────────


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = FastAPI()
    app.add_exception_handler(AppError, app_error_handler)

    @app.get("/coded")
    def coded() -> None:
        raise AppError(409, "Wait", "attempt_cooldown", next_attempt_at=AT)

    @app.get("/coded-plain")
    def coded_plain() -> None:
        raise AppError(404, "Gone", "feed_post_not_found")

    @app.get("/plain")
    def plain() -> None:
        raise HTTPException(status_code=404, detail="Gone")

    yield TestClient(app)


class TestHandler:
    def test_coded_error_sends_code_and_camel_case_extras(self, client: TestClient) -> None:
        response = client.get("/coded")

        assert response.status_code == 409
        assert response.json() == {
            "detail": "Wait",
            "code": "attempt_cooldown",
            "nextAttemptAt": "2026-05-01T10:00:00Z",
        }

    def test_coded_error_leaves_out_unset_extras(self, client: TestClient) -> None:
        assert client.get("/coded-plain").json() == {"detail": "Gone", "code": "feed_post_not_found"}

    def test_plain_http_exception_keeps_the_detail_only_body(self, client: TestClient) -> None:
        response = client.get("/plain")

        assert response.status_code == 404
        assert response.json() == {"detail": "Gone"}


# ── Spaces ────────────────────────────────────────────────────────────────────


class TestArchived:
    @pytest.mark.parametrize(
        ("space", "detail"),
        [
            (SimpleNamespace(kind=int(SpaceKind.CLASSROOM), parent_id=None), "The classroom is archived"),
            (SimpleNamespace(kind=int(SpaceKind.COURSE), parent_id="c1"), "The classroom is archived"),
            (SimpleNamespace(kind=int(SpaceKind.COURSE), parent_id=None), "The course is archived"),
        ],
    )
    def test_require_active(self, space: SimpleNamespace, detail: str) -> None:
        with patch.object(space_service, "is_archived", return_value=True):
            error = _error_of(space_service.require_active, MagicMock(), space)

        assert _assert_coded(error, status=409, code="space_archived").detail == detail


class TestOrphanCourses:
    def test_removed_course_with_results_blocks_the_sweep(self) -> None:
        classroom = SimpleNamespace(id="c1", kind=int(SpaceKind.CLASSROOM), owner_id="t1")
        orphan = SimpleNamespace(id="o1", owner_id="t1")
        with (
            patch.object(space_draft_service.space_item_crud, "list_course_items", return_value=[]),
            patch.object(space_draft_service.space_crud, "list_orphan_children", return_value=[orphan]),
            patch.object(space_draft_service.space_member_crud, "list_active_editor_ids", return_value=[]),
            patch.object(space_draft_service.space_content_crud, "has_member_data", return_value=True),
        ):
            error = _error_of(space_draft_service._sweep_orphan_courses, MagicMock(), space=classroom)

        _assert_coded(error, status=409, code="removed_course_has_results")


# ── Attempts ──────────────────────────────────────────────────────────────────


def _start_attempt(
    *, item: SimpleNamespace | None = None, state: SimpleNamespace | None = None, variants: list[Any] | None = None
) -> HTTPException:
    item = item or SimpleNamespace(id="i1", opens_at=None, closes_at=None)
    state = state or SimpleNamespace(open_attempt=None, attempts_left=None, next_attempt_at=None)
    membership = SimpleNamespace(role=SpaceRole.VIEWER, can_author=False)
    progress = space_attempt_service.space_progress_service
    with (
        patch.object(space_attempt_service, "get_space_or_404", return_value=SimpleNamespace(id="s1")),
        patch.object(space_attempt_service, "get_membership", return_value=membership),
        patch.object(space_attempt_service, "_get_published_test_item_or_404", return_value=item),
        patch.object(space_attempt_service, "require_active"),
        patch.object(space_attempt_service, "_expire_stale"),
        patch.object(space_attempt_service, "_available_variants", return_value=variants or []),
        patch.object(space_attempt_service.space_attempt_crud, "list_by_user_items", return_value=[]),
        patch.object(progress, "get_member_row"),
        patch.object(progress, "utcnow", return_value=AT),
        patch.object(progress, "attempt_state", return_value=state),
    ):
        return _error_of(
            space_attempt_service.start_attempt,
            MagicMock(),
            space_id="s1",
            item_id="i1",
            current_user=SimpleNamespace(id="u1"),
        )


class TestStartAttempt:
    def test_not_open_yet(self) -> None:
        item = SimpleNamespace(id="i1", opens_at=AT + timedelta(hours=1), closes_at=None)

        _assert_coded(_start_attempt(item=item), status=409, code="attempt_not_open")

    def test_window_closed(self) -> None:
        item = SimpleNamespace(id="i1", opens_at=None, closes_at=AT - timedelta(hours=1))

        _assert_coded(_start_attempt(item=item), status=409, code="attempt_window_closed")

    def test_no_attempts_left(self) -> None:
        state = SimpleNamespace(open_attempt=None, attempts_left=0, next_attempt_at=None)

        _assert_coded(_start_attempt(state=state), status=409, code="attempt_no_attempts_left")

    def test_cooldown_sends_the_next_attempt_time_as_a_field(self) -> None:
        next_attempt_at = AT + timedelta(hours=2)
        state = SimpleNamespace(open_attempt=None, attempts_left=None, next_attempt_at=next_attempt_at)

        error = _assert_coded(_start_attempt(state=state), status=409, code="attempt_cooldown")

        assert error.body.next_attempt_at == next_attempt_at

    def test_no_questions(self) -> None:
        _assert_coded(_start_attempt(), status=409, code="attempt_no_questions")


def _submit_attempt(
    *,
    attempt: SimpleNamespace,
    item: SimpleNamespace | None = None,
    past_grace: bool = False,
    variants: dict[str, list[str]] | None = None,
) -> HTTPException:
    item = item or SimpleNamespace(id="i1", space_id="s1", closes_at=None)
    progress = space_attempt_service.space_progress_service
    with (
        patch.object(space_attempt_service, "get_space_or_404", return_value=SimpleNamespace(id="s1")),
        patch.object(space_attempt_service, "get_membership"),
        patch.object(space_attempt_service, "_require_viewer"),
        patch.object(space_attempt_service, "require_active"),
        patch.object(space_attempt_service.space_attempt_crud, "get", return_value=attempt),
        patch.object(space_attempt_service.space_attempt_crud, "close"),
        patch.object(space_attempt_service.space_item_crud, "get", return_value=item),
        patch.object(
            space_attempt_service.space_item_test_crud,
            "list_by_items",
            return_value={"i1": ["t1"]} if variants is None else variants,
        ),
        patch.object(progress, "utcnow", return_value=AT),
        patch.object(progress, "is_past_grace", return_value=past_grace),
    ):
        return _error_of(
            space_attempt_service.submit_attempt,
            MagicMock(),
            space_id="s1",
            attempt_id="a1",
            current_user=SimpleNamespace(id="u1"),
            submission=MagicMock(),
            background_tasks=MagicMock(),
        )


def _open_attempt(**changes: Any) -> SimpleNamespace:
    fields: dict[str, Any] = {
        "id": "a1",
        "item_id": "i1",
        "user_id": "u1",
        "test_id": "t1",
        "test_version": 1,
        "status": int(AttemptStatus.OPEN),
        "deadline_at": None,
    }
    return SimpleNamespace(**{**fields, **changes})


class TestSubmitAttempt:
    def test_attempt_already_closed(self) -> None:
        attempt = _open_attempt(status=int(AttemptStatus.SUBMITTED))

        _assert_coded(_submit_attempt(attempt=attempt), status=409, code="attempt_closed")

    def test_window_closed_after_the_grace_time(self) -> None:
        item = SimpleNamespace(id="i1", space_id="s1", closes_at=AT - timedelta(hours=1))

        _assert_coded(_submit_attempt(attempt=_open_attempt(), item=item), status=409, code="attempt_window_closed")

    def test_time_over(self) -> None:
        _assert_coded(_submit_attempt(attempt=_open_attempt(), past_grace=True), status=409, code="attempt_time_over")

    def test_variant_removed_by_a_publish(self) -> None:
        error = _submit_attempt(attempt=_open_attempt(), variants={})

        _assert_coded(error, status=409, code="attempt_closed")

    def test_pinned_test_missing(self) -> None:
        attempt = _open_attempt(test_version=2)
        live = SimpleNamespace(version=3)
        with (
            patch.object(space_attempt_service.test_crud, "get_by_id", return_value=live),
            patch.object(space_attempt_service.test_crud, "get_snapshot", return_value=None),
        ):
            error = _error_of(space_attempt_service._pinned_test, MagicMock(), attempt=attempt)

        _assert_coded(error, status=409, code="attempt_closed")


class TestAssistBlockedByCourseTest:
    def test_open_attempt_blocks_the_assistant(self) -> None:
        with patch.object(space_attempt_service.space_attempt_crud, "has_live_open", return_value=True):
            error = _error_of(space_attempt_service.require_no_open_attempt, MagicMock(), user=SimpleNamespace(id="u1"))

        _assert_coded(error, status=409, code="assist_blocked_by_course_test")


# ── Grade override and challenge ──────────────────────────────────────────────


class TestGradeOverride:
    def test_personal_result_is_not_in_a_classroom(self) -> None:
        answer = SimpleNamespace(test_result=SimpleNamespace(id="r1"))
        found = (SimpleNamespace(), SimpleNamespace(id="s1"))
        with (
            patch.object(grade_override_service.answer_crud, "get_by_id_with_test_result", return_value=answer),
            patch.object(grade_override_service, "result_item_and_space", return_value=found),
            patch.object(grade_override_service, "resolve_role", return_value=SpaceRole.OWNER),
            patch.object(grade_override_service, "is_classroom_space", return_value=False),
        ):
            error = _error_of(
                grade_override_service._get_reviewable,
                MagicMock(),
                answer_id="a1",
                current_user=SimpleNamespace(id="t1"),
            )

        _assert_coded(error, status=400, code="override_not_classroom")

    def test_score_above_the_points_of_the_question(self) -> None:
        reviewable = (SimpleNamespace(id="a1"), SimpleNamespace(), SimpleNamespace(points=2.5))
        with patch.object(grade_override_service, "_get_reviewable", return_value=reviewable):
            error = _error_of(
                grade_override_service.set_override,
                MagicMock(),
                answer_id="a1",
                score=3,
                current_user=SimpleNamespace(id="t1"),
            )

        coded = _assert_coded(error, status=400, code="override_score_out_of_range")
        assert coded.body.max_points == 2.5
        assert coded.detail == "The score must be between 0 and 2.5"


class TestChallenge:
    def test_teacher_graded_answer_cannot_be_challenged(self) -> None:
        answer = SimpleNamespace(test_result=SimpleNamespace(user_id="u1"), override_score=1.0)

        error = _error_of(challenge_service._validate_challenge_eligibility, answer, MagicMock(), MagicMock(), "u1")

        _assert_coded(error, status=409, code="answer_overridden")


# ── Feed ──────────────────────────────────────────────────────────────────────

STUDENT = SimpleNamespace(can_author=False)


class TestFeed:
    def test_student_cannot_post_when_only_teachers_post(self) -> None:
        with patch.object(space_feed_service, "_feed_permission", return_value=FeedPermission.STUDENTS_COMMENT):
            error = _error_of(
                space_feed_service._require_can_post, MagicMock(), classroom=MagicMock(), membership=STUDENT
            )

        _assert_coded(error, status=403, code="feed_teacher_only_post")

    def test_student_cannot_comment_when_only_teachers_write(self) -> None:
        with patch.object(space_feed_service, "_feed_permission", return_value=FeedPermission.TEACHERS_ONLY):
            error = _error_of(
                space_feed_service._require_can_comment, MagicMock(), classroom=MagicMock(), membership=STUDENT
            )

        _assert_coded(error, status=403, code="feed_teacher_only_comment")

    def test_post_not_found(self) -> None:
        with patch.object(space_feed_service.space_post_crud, "get", return_value=None):
            error = _error_of(space_feed_service._get_post_and_classroom, MagicMock(), post_id="p1")

        _assert_coded(error, status=404, code="feed_post_not_found")

    def test_comment_not_found(self) -> None:
        with patch.object(space_feed_service.space_comment_crud, "get", return_value=None):
            error = _error_of(space_feed_service._get_comment_and_context, MagicMock(), comment_id="c1")

        _assert_coded(error, status=404, code="feed_comment_not_found")

    def test_only_the_author_edits_a_post(self) -> None:
        with (
            patch.object(
                space_feed_service,
                "_get_post_and_classroom",
                return_value=(SimpleNamespace(author_id="other"), SimpleNamespace()),
            ),
            patch.object(space_feed_service, "_require_member"),
        ):
            error = _error_of(
                space_feed_service.update_post,
                MagicMock(),
                post_id="p1",
                current_user=SimpleNamespace(id="u1"),
                data=MagicMock(),
            )

        _assert_coded(error, status=403, code="feed_author_only_edit")

    def test_only_the_author_edits_a_comment(self) -> None:
        context = (SimpleNamespace(author_id="other"), SimpleNamespace(), SimpleNamespace())
        with (
            patch.object(space_feed_service, "_get_comment_and_context", return_value=context),
            patch.object(space_feed_service, "_require_member"),
        ):
            error = _error_of(
                space_feed_service.update_comment,
                MagicMock(),
                comment_id="c1",
                current_user=SimpleNamespace(id="u1"),
                data=MagicMock(),
            )

        _assert_coded(error, status=403, code="feed_author_only_edit")


# ── Class key settings ────────────────────────────────────────────────────────


class TestClassKeySettings:
    def test_provider_change_without_a_new_key_has_a_code(self) -> None:
        settings = SimpleNamespace(ai_provider=1, encrypted_class_key="stored")
        data = ClassroomSettingsUpdate.model_validate({"aiProvider": 2})
        with (
            patch.object(classroom_service, "get_classroom_or_404", return_value=SimpleNamespace(id="c1")),
            patch.object(classroom_service, "require_owner"),
            patch.object(classroom_service, "require_active"),
            patch.object(classroom_service, "_get_settings", return_value=settings),
        ):
            error = _error_of(
                classroom_service.update_settings,
                MagicMock(),
                classroom_id="c1",
                current_user=SimpleNamespace(id="t1"),
                data=data,
            )

        coded = _assert_coded(error, status=422, code="class_key_provider_change_needs_key")
        assert coded.detail == classroom_service.PROVIDER_CHANGE_NEEDS_KEY


# ── Remove completion ─────────────────────────────────────────────────────────


def _remove_completion(*, completed_ids: set[str], reaches_threshold: bool) -> HTTPException:
    item = SimpleNamespace(id="i1", is_draft=False, kind=int(SpaceItemKind.TEST), space_id="c1")
    classroom = SimpleNamespace(id="c1", parent_id=None)
    progress = classroom_service.space_progress_service
    with (
        patch.object(classroom_service, "get_classroom_or_404", return_value=classroom),
        patch.object(classroom_service, "require_author"),
        patch.object(classroom_service, "require_active"),
        patch.object(classroom_service, "resolve_role", return_value=SpaceRole.VIEWER),
        patch.object(classroom_service.space_item_crud, "get", return_value=item),
        patch.object(classroom_service.space_crud, "get_by_id", return_value=classroom),
        patch.object(classroom_service.space_item_completion_crud, "list_completed_ids", return_value=completed_ids),
        patch.object(classroom_service.test_result_crud, "best_scores_by_item", return_value={"i1": 90.0}),
        patch.object(progress, "get_member_row"),
        patch.object(progress, "reaches_threshold", return_value=reaches_threshold),
    ):
        return _error_of(
            classroom_service.remove_completion,
            MagicMock(),
            classroom_id="c1",
            item_id="i1",
            user_id="u1",
            current_user=SimpleNamespace(id="t1"),
        )


class TestRemoveCompletion:
    def test_completion_not_found(self) -> None:
        error = _remove_completion(completed_ids=set(), reaches_threshold=False)

        _assert_coded(error, status=404, code="completion_not_found")

    def test_best_score_reaches_the_threshold(self) -> None:
        error = _remove_completion(completed_ids={"i1"}, reaches_threshold=True)

        _assert_coded(error, status=409, code="completion_passed")


# ── AI key errors ─────────────────────────────────────────────────────────────


class TestAIKeyErrors:
    def test_missing_key_has_a_code(self) -> None:
        assert AIKeyError(llm.NO_KEY_MESSAGE, code="ai_not_configured").code == "ai_not_configured"

    def test_used_up_budget_has_a_code(self) -> None:
        assert AIKeyError(llm.CAP_REACHED_MESSAGE, code="ai_budget_used_up").code == "ai_budget_used_up"

    def test_unreadable_key_has_its_own_code(self) -> None:
        http_error = AIKeyError(llm.KEY_UNREADABLE_MESSAGE, code="ai_key_unreadable").to_http_error()

        coded = _assert_coded(http_error, status=403, code="ai_key_unreadable")
        assert coded.detail == llm.KEY_UNREADABLE_MESSAGE

    def test_a_stored_key_that_cannot_be_read_raises_the_unreadable_code(self) -> None:
        with (
            patch("app.services.encryption.decrypt", side_effect=InvalidToken),
            pytest.raises(AIKeyError) as exc_info,
        ):
            llm.decrypt_key("not-valid")

        assert exc_info.value.code == "ai_key_unreadable"

    def test_an_error_without_a_code_stays_a_plain_403(self) -> None:
        http_error = AIKeyError("Something else").to_http_error()

        assert not isinstance(http_error, AppError)
        assert http_error.status_code == 403

    def test_complete_for_user_without_a_key_sends_the_code(self) -> None:
        with patch.object(llm, "get_user_llm_client", side_effect=ValueError("No Anthropic API key configured")):
            error = _error_of(
                llm.complete_for_user,
                user=SimpleNamespace(),
                action="notes",
                system="s",
                user_prompt="p",
                max_tokens=1,
            )

        coded = _assert_coded(error, status=403, code="ai_not_configured")
        assert coded.detail == llm.NO_KEY_MESSAGE

    def test_complete_for_user_over_the_class_cap_sends_the_code(self) -> None:
        cap_error = AIKeyError(llm.CAP_REACHED_MESSAGE, code="ai_budget_used_up")
        with patch("app.services.llm_key_service.resolve_llm", side_effect=cap_error):
            error = _error_of(
                llm.complete_for_user,
                user=SimpleNamespace(),
                action="notes",
                system="s",
                user_prompt="p",
                max_tokens=1,
                db=MagicMock(),
            )

        _assert_coded(error, status=403, code="ai_budget_used_up")


def _error_events(exc: Exception) -> list[dict[str, Any]]:
    db = MagicMock()
    with (
        patch.object(assist_service, "_stream_assist_inner", side_effect=exc),
        patch.object(assist_service, "_record_usage"),
    ):
        chunks = list(assist_service.stream_assist(db, current_user=MagicMock(), request=MagicMock()))
    return [json.loads(chunk.split("data: ", 1)[1]) for chunk in chunks if chunk.startswith("event: error")]


class TestAssistStreamErrors:
    def test_missing_key_event_has_the_code(self) -> None:
        events = _error_events(AIKeyError(llm.NO_KEY_MESSAGE, code="ai_not_configured"))

        assert events == [{"message": llm.NO_KEY_MESSAGE, "code": "ai_not_configured"}]

    def test_unreadable_key_event_has_its_own_code(self) -> None:
        events = _error_events(AIKeyError(llm.KEY_UNREADABLE_MESSAGE, code="ai_key_unreadable"))

        assert events == [{"message": llm.KEY_UNREADABLE_MESSAGE, "code": "ai_key_unreadable"}]

    def test_error_without_a_code_has_no_code_field(self) -> None:
        events = _error_events(AIKeyError("Something else"))

        assert events == [{"message": "Something else"}]
