"""ST-67 Phase A: policy, variants, attempts, completion, results (real DB, each test is rolled back)."""

import json
from collections.abc import Callable
from datetime import timedelta
from unittest.mock import patch

import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import AttemptStatus, QuestionType, RevealAnswers, SpaceItemKind, SpaceVisibility
from app.crud import space_attempt as space_attempt_crud
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import space_item_test as space_item_test_crud
from app.models.answer import Answer
from app.models.question import Question
from app.models.space_attempt import SpaceAttempt
from app.models.space_item import SpaceItem
from app.models.space_member import SpaceMember
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.answer import ChallengeRequest
from app.schemas.correction import TestSubmission
from app.schemas.space import (
    SpaceAttemptStart,
    SpaceCreate,
    SpaceDetail,
    SpaceItemCopy,
    SpaceItemRead,
    SpaceItemUpdate,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceVariantCreate,
    SpaceVariantOrder,
)
from app.schemas.test import TestCreate, TestUpdate
from app.services import (
    challenge_service,
    grading_service,
    space_attempt_service,
    space_draft_service,
    space_member_service,
    space_progress_service,
    space_service,
    test_result_service,
    test_service,
)
from app.services.llm import CompletionResult
from tests.llm_fakes import resolve_to
from tests.space_factories import new_note, new_test, new_user

pytestmark = pytest.mark.db


def _status_code(service_call: Callable[..., object], db: Session, **kwargs: object) -> int:
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return exc_info.value.status_code


def _status_code_of(service_call: Callable[..., object], db: Session, **kwargs: object) -> int | None:
    """The HTTP status of the error the call raises, or None when it does not raise."""
    try:
        service_call(db, **kwargs)
    except HTTPException as error:
        return error.status_code
    return None


@pytest.fixture
def owner(db_session: Session) -> User:
    return new_user(db_session)


def _publish(db: Session, owner: User, space_id: str, **kwargs: object) -> SpaceDetail:
    return space_draft_service.publish(
        db, space_id=space_id, current_user=owner, data=SpacePublishRequest.model_validate(kwargs)
    )


def _test_items(db: Session, space_id: str, *, is_draft: bool = False) -> list[SpaceItem]:
    stmt = select(SpaceItem).where(
        SpaceItem.space_id == space_id,
        SpaceItem.is_draft.is_(is_draft),
        SpaceItem.kind == int(SpaceItemKind.TEST),
    )
    return list(db.scalars(stmt).all())


def _course_with_test(db: Session, owner: User, *, long_text: bool = False, **policy: object) -> tuple[str, str, str]:
    """A published PUBLIC course with one TEST item (one question: "to go" -> "ir").

    `long_text`: the question is a Long Text one with two criteria (weight 0.5 each) instead.
    Returns (space id, published item id, test id).
    """
    data = SpaceCreate(title="Spanish", visibility=SpaceVisibility.PUBLIC)
    course = space_service.create_course(db, current_user=owner, data=data)
    course = space_draft_service.add_section(
        db, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
    )
    assert course.draft_sections is not None
    source = new_test(db, user=owner)
    if long_text:
        question = source.questions[0]
        question.question_type = int(QuestionType.LONG_TEXT)
        question.content = {
            "length_limit": 1,
            "rubric": [{"point": "first", "weight": 0.5}, {"point": "second", "weight": 0.5}],
        }
        db.flush()
    test_id = space_draft_service.copy_item(
        db,
        space_id=course.id,
        current_user=owner,
        data=SpaceItemCopy(section_id=course.draft_sections[0].id, test_id=source.id),
    ).test_id
    assert test_id is not None
    if policy:
        draft_item = _test_items(db, course.id, is_draft=True)[0]
        space_draft_service.update_item(
            db,
            space_id=course.id,
            item_id=draft_item.id,
            current_user=owner,
            data=SpaceItemUpdate.model_validate(policy),
        )
    _publish(db, owner, course.id)
    return course.id, _test_items(db, course.id)[0].id, test_id


def _viewer(db: Session, space_id: str) -> User:
    viewer = new_user(db)
    space_member_service.join(db, space_id=space_id, current_user=viewer)
    return viewer


def _start(db: Session, space_id: str, item_id: str, user: User) -> SpaceAttemptStart:
    return space_attempt_service.start_attempt(db, space_id=space_id, item_id=item_id, current_user=user)


def _answers(start: SpaceAttemptStart, user_answer: str) -> TestSubmission:
    return TestSubmission.model_validate(
        {"answers": [{"question_id": q.id, "user_answer": user_answer} for q in start.test.questions]}
    )


def _submit(db: Session, space_id: str, start: SpaceAttemptStart, user: User, user_answer: str = "ir") -> object:
    assert start.attempt_id is not None
    return space_attempt_service.submit_attempt(
        db,
        space_id=space_id,
        attempt_id=start.attempt_id,
        current_user=user,
        submission=_answers(start, user_answer),
        background_tasks=BackgroundTasks(),
    )


def _edit_title_of_first_question(db: Session, owner: User, space_id: str, item_id: str) -> str:
    """Edit mode: change the question of the TEST item, so publish freezes the old version. Returns the twin id."""
    detail = space_draft_service.enter_edit_mode(db, space_id=space_id, current_user=owner)
    assert detail.draft_sections is not None
    draft_item = detail.draft_sections[0].items[0]
    twin_id = space_draft_service.make_editable(
        db, space_id=space_id, item_id=draft_item.id, current_user=owner
    ).test_id
    assert twin_id is not None
    test_service.update_test(
        db,
        test_id=twin_id,
        current_user=owner,
        data=TestUpdate.model_validate(
            {"questions": [{"questionType": 1, "prompt": "to come", "content": {"answers": ["venir"]}}]}
        ),
    )
    return draft_item.id


# ---------------------------------------------------------------------------
# Policy and variants (draft side)
# ---------------------------------------------------------------------------


class TestPolicy:
    @pytest.mark.parametrize(
        "field,value",
        [
            ("pass_threshold", 1.5),
            ("pass_threshold", -0.1),
            ("max_attempts", 0),
            ("cooldown_hours", 0),
            ("time_limit_minutes", 0),
        ],
    )
    def test_invalid_values_are_refused(self, field: str, value: float) -> None:
        with pytest.raises(ValidationError):
            SpaceItemUpdate.model_validate({field: value})

    def test_a_sent_null_means_no_limit(self) -> None:
        data = SpaceItemUpdate.model_validate({"max_attempts": None})
        assert "max_attempts" in data.model_fields_set

    def test_policy_reaches_the_published_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(
            db_session,
            owner,
            pass_threshold=0.8,
            max_attempts=3,
            cooldown_hours=2,
            time_limit_minutes=10,
            reveal_answers=RevealAnswers.NEVER,
        )
        item = db_session.get(SpaceItem, item_id)
        assert item is not None and item.space_id == space_id
        assert (item.pass_threshold, item.max_attempts, item.cooldown_hours, item.time_limit_minutes) == (0.8, 3, 2, 10)
        assert item.reveal_answers == int(RevealAnswers.NEVER)


class TestVariants:
    def test_add_reorder_remove_and_publish(self, db_session: Session, owner: User) -> None:
        space_id, _, _ = _course_with_test(db_session, owner)
        space_draft_service.enter_edit_mode(db_session, space_id=space_id, current_user=owner)
        draft_item = _test_items(db_session, space_id, is_draft=True)[0]

        added = space_draft_service.add_variant(
            db_session,
            space_id=space_id,
            item_id=draft_item.id,
            current_user=owner,
            data=SpaceVariantCreate(title="Variant B"),
        ).test_id
        assert added is not None
        links = space_item_test_crud.list_by_items(db_session, item_ids=[draft_item.id])[draft_item.id]
        assert len(links) == 2

        space_draft_service.reorder_variants(
            db_session,
            space_id=space_id,
            item_id=draft_item.id,
            current_user=owner,
            data=SpaceVariantOrder(test_ids=list(reversed(links))),
        )
        assert space_item_test_crud.list_by_items(db_session, item_ids=[draft_item.id])[draft_item.id] == list(
            reversed(links)
        )
        assert (
            _status_code(
                space_draft_service.reorder_variants,
                db_session,
                space_id=space_id,
                item_id=draft_item.id,
                current_user=owner,
                data=SpaceVariantOrder(test_ids=links[:1]),
            )
            == 400
        )

        space_draft_service.remove_variant(
            db_session, space_id=space_id, item_id=draft_item.id, test_id=added, current_user=owner
        )
        only = space_item_test_crud.list_by_items(db_session, item_ids=[draft_item.id])[draft_item.id]
        assert len(only) == 1
        assert (
            _status_code(
                space_draft_service.remove_variant,
                db_session,
                space_id=space_id,
                item_id=draft_item.id,
                test_id=only[0],
                current_user=owner,
            )
            == 400
        )

    def test_removed_variant_expires_open_attempts(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        # A second variant, published.
        space_draft_service.enter_edit_mode(db_session, space_id=space_id, current_user=owner)
        draft_item = _test_items(db_session, space_id, is_draft=True)[0]
        extra = space_draft_service.add_variant(
            db_session,
            space_id=space_id,
            item_id=draft_item.id,
            current_user=owner,
            data=SpaceVariantCreate(title="B"),
        ).test_id
        assert extra is not None
        test_service.update_test(
            db_session,
            test_id=extra,
            current_user=owner,
            data=TestUpdate.model_validate(
                {"questions": [{"questionType": 1, "prompt": "to eat", "content": {"answers": ["comer"]}}]}
            ),
        )
        _publish(db_session, owner, space_id)

        viewer = _viewer(db_session, space_id)
        started = _start(db_session, space_id, item_id, viewer)
        assert started.attempt_id is not None
        attempt = db_session.get(SpaceAttempt, started.attempt_id)
        assert attempt is not None
        pinned_variant = attempt.test_id

        # Remove the variant the viewer got.
        space_draft_service.enter_edit_mode(db_session, space_id=space_id, current_user=owner)
        draft_item = _test_items(db_session, space_id, is_draft=True)[0]
        draft_variants = space_item_test_crud.list_by_items(db_session, item_ids=[draft_item.id])[draft_item.id]
        victim = next(v for v in draft_variants if v == pinned_variant or _is_twin_of(db_session, v, pinned_variant))
        space_draft_service.remove_variant(
            db_session, space_id=space_id, item_id=draft_item.id, test_id=victim, current_user=owner
        )
        _publish(db_session, owner, space_id)
        db_session.expire_all()

        closed = db_session.get(SpaceAttempt, started.attempt_id)
        assert closed is not None and closed.status == int(AttemptStatus.EXPIRED)


def _is_twin_of(db: Session, test_id: str, live_id: str) -> bool:
    from app.models.test import Test

    test = db.get(Test, test_id)
    return test is not None and test.draft_of_id == live_id


# ---------------------------------------------------------------------------
# Attempts
# ---------------------------------------------------------------------------


class TestAttempts:
    def test_pass_completes_the_item_and_the_course(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)

        started = _start(db_session, space_id, item_id, viewer)
        assert started.attempt_id is not None and started.resumed is False
        _submit(db_session, space_id, started, viewer)

        detail = space_service.get_course(db_session, space_id=space_id, current_user=viewer)
        item = detail.sections[0].items[0]
        assert item.completed is True and item.best_score == 100.0 and item.attempts_used == 1
        assert detail.progress is not None and detail.progress.percent == 100
        member = db_session.scalars(select(SpaceMember).where(SpaceMember.user_id == viewer.id)).one()
        assert member.completed_at is not None
        assert detail.progress.completed_at == member.completed_at

    def test_a_low_score_does_not_complete(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "nope")

        item = space_service.get_course(db_session, space_id=space_id, current_user=viewer).sections[0].items[0]
        assert item.completed is False and item.best_score == 0.0

    def test_open_attempt_is_resumed(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        first = _start(db_session, space_id, item_id, viewer)
        second = _start(db_session, space_id, item_id, viewer)
        assert second.attempt_id == first.attempt_id and second.resumed is True

    def test_max_attempts(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, max_attempts=1)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "nope")

        assert (
            _status_code(
                space_attempt_service.start_attempt, db_session, space_id=space_id, item_id=item_id, current_user=viewer
            )
            == 409
        )

    def test_cooldown(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, cooldown_hours=1)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "nope")

        assert (
            _status_code(
                space_attempt_service.start_attempt, db_session, space_id=space_id, item_id=item_id, current_user=viewer
            )
            == 409
        )
        item = space_service.get_course(db_session, space_id=space_id, current_user=viewer).sections[0].items[0]
        assert item.next_attempt_at is not None

    def test_timer_deadline_and_grace(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, time_limit_minutes=5)
        viewer = _viewer(db_session, space_id)
        started = _start(db_session, space_id, item_id, viewer)
        assert started.deadline_at is not None and started.started_at is not None
        assert started.deadline_at - started.started_at == timedelta(minutes=5)
        attempt = db_session.get(SpaceAttempt, started.attempt_id or "")
        assert attempt is not None

        # Inside the grace (deadline passed 30 s ago): accepted.
        attempt.deadline_at = space_progress_service.utcnow() - timedelta(seconds=30)
        db_session.flush()
        _submit(db_session, space_id, started, viewer)

        # A second attempt, 5 minutes past the deadline: refused, and the attempt expires.
        again = _start(db_session, space_id, item_id, viewer)
        late = db_session.get(SpaceAttempt, again.attempt_id or "")
        assert late is not None
        late.deadline_at = space_progress_service.utcnow() - timedelta(minutes=5)
        db_session.flush()
        assert (
            _status_code(
                space_attempt_service.submit_attempt,
                db_session,
                space_id=space_id,
                attempt_id=late.id,
                current_user=viewer,
                submission=_answers(again, "ir"),
                background_tasks=BackgroundTasks(),
            )
            == 409
        )
        db_session.expire_all()
        assert db_session.get(SpaceAttempt, late.id).status == int(AttemptStatus.EXPIRED)  # type: ignore[union-attr]

    def test_expired_open_attempt_is_replaced_on_next_start(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, time_limit_minutes=5)
        viewer = _viewer(db_session, space_id)
        first = _start(db_session, space_id, item_id, viewer)
        stale = db_session.get(SpaceAttempt, first.attempt_id or "")
        assert stale is not None
        stale.deadline_at = space_progress_service.utcnow() - timedelta(minutes=5)
        db_session.flush()

        second = _start(db_session, space_id, item_id, viewer)
        assert second.attempt_id != first.attempt_id and second.resumed is False
        assert db_session.get(SpaceAttempt, first.attempt_id or "").status == int(AttemptStatus.EXPIRED)  # type: ignore[union-attr]

    def test_variants_rotate(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        space_draft_service.enter_edit_mode(db_session, space_id=space_id, current_user=owner)
        draft_item = _test_items(db_session, space_id, is_draft=True)[0]
        space_draft_service.add_variant(
            db_session, space_id=space_id, item_id=draft_item.id, current_user=owner, data=SpaceVariantCreate(title="B")
        )
        test_id = space_draft_service.make_editable(
            db_session, space_id=space_id, item_id=draft_item.id, current_user=owner, test_id=None
        ).test_id
        assert test_id is not None
        variant_b = space_item_test_crud.list_by_items(db_session, item_ids=[draft_item.id])[draft_item.id][1]
        test_service.update_test(
            db_session,
            test_id=variant_b,
            current_user=owner,
            data=TestUpdate.model_validate(
                {"questions": [{"questionType": 1, "prompt": "to eat", "content": {"answers": ["comer"]}}]}
            ),
        )
        _publish(db_session, owner, space_id)

        viewer = _viewer(db_session, space_id)
        used = []
        for _ in range(2):
            started = _start(db_session, space_id, item_id, viewer)
            _submit(db_session, space_id, started, viewer, "nope")
            attempt = db_session.get(SpaceAttempt, started.attempt_id or "")
            assert attempt is not None
            used.append(attempt.test_id)
        assert len(set(used)) == 2

    def test_author_preview_writes_nothing(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, max_attempts=1)
        for _ in range(3):
            preview = _start(db_session, space_id, item_id, owner)
            assert preview.attempt_id is None and preview.deadline_at is None
        assert db_session.scalars(select(SpaceAttempt).where(SpaceAttempt.item_id == item_id)).all() == []

    def test_archived_course_refuses_start_and_submit(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        started = _start(db_session, space_id, item_id, viewer)
        space_service.set_archived(db_session, space_id=space_id, current_user=owner, archived=True)

        assert (
            _status_code(
                space_attempt_service.start_attempt, db_session, space_id=space_id, item_id=item_id, current_user=viewer
            )
            == 409
        )
        assert (
            _status_code(
                space_attempt_service.submit_attempt,
                db_session,
                space_id=space_id,
                attempt_id=started.attempt_id or "",
                current_user=viewer,
                submission=_answers(started, "ir"),
                background_tasks=BackgroundTasks(),
            )
            == 409
        )

    def test_a_stranger_can_not_submit_or_start(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        started = _start(db_session, space_id, item_id, viewer)
        stranger = new_user(db_session)
        assert (
            _status_code(
                space_attempt_service.start_attempt,
                db_session,
                space_id=space_id,
                item_id=item_id,
                current_user=stranger,
            )
            == 403
        )
        assert (
            _status_code(
                space_attempt_service.submit_attempt,
                db_session,
                space_id=space_id,
                attempt_id=started.attempt_id or "",
                current_user=stranger,
                submission=_answers(started, "ir"),
                background_tasks=BackgroundTasks(),
            )
            == 404
        )

    def test_one_open_attempt_per_user_and_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, test_id = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        _start(db_session, space_id, item_id, viewer)
        with pytest.raises(IntegrityError), db_session.begin_nested():
            space_attempt_crud.create(
                db_session,
                item_id=item_id,
                user_id=viewer.id,
                test_id=test_id,
                test_version=1,
                started_at=space_progress_service.utcnow(),
                deadline_at=None,
            )


class TestRaces:
    def test_submit_on_a_removed_variant_expires_the_attempt(self, db_session: Session, owner: User) -> None:
        """A start that raced with a publish keeps an OPEN attempt on a variant that is no longer linked."""
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        started = _start(db_session, space_id, item_id, viewer)
        assert started.attempt_id is not None
        space_item_test_crud.replace(db_session, item_id=item_id, test_ids=[])

        assert _status_code(_submit, db_session, space_id=space_id, start=started, user=viewer) == 409
        attempt = db_session.get(SpaceAttempt, started.attempt_id)
        assert attempt is not None and attempt.status == int(AttemptStatus.EXPIRED)
        assert db_session.scalars(select(TestResult).where(TestResult.user_id == viewer.id)).first() is None

    def test_the_completion_sync_locks_the_member_row(self, db_session: Session, owner: User) -> None:
        space_id, _, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        with patch.object(
            space_progress_service.space_member_crud,
            "get_for_update",
            wraps=space_progress_service.space_member_crud.get_for_update,
        ) as lock:
            space_progress_service.sync_member_completion(db_session, space_id=space_id, user_id=viewer.id)
        lock.assert_called_once_with(db_session, space_id=space_id, user_id=viewer.id)


class TestAssistantBlock:
    def test_open_attempt_blocks_the_assistant_until_deadline_and_grace_pass(
        self, db_session: Session, owner: User
    ) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, time_limit_minutes=5)
        viewer = _viewer(db_session, space_id)
        assert _status_code_of(space_attempt_service.require_no_open_attempt, db_session, user=viewer) is None

        started = _start(db_session, space_id, item_id, viewer)
        assert _status_code_of(space_attempt_service.require_no_open_attempt, db_session, user=viewer) == 409

        attempt = db_session.get(SpaceAttempt, started.attempt_id or "")
        assert attempt is not None
        # Inside the grace: still blocked. Past the grace: free again.
        attempt.deadline_at = space_progress_service.utcnow() - timedelta(seconds=30)
        db_session.flush()
        assert _status_code_of(space_attempt_service.require_no_open_attempt, db_session, user=viewer) == 409
        attempt.deadline_at = space_progress_service.utcnow() - timedelta(minutes=5)
        db_session.flush()
        assert _status_code_of(space_attempt_service.require_no_open_attempt, db_session, user=viewer) is None

    def test_an_open_attempt_without_deadline_blocks_and_a_submit_frees(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        started = _start(db_session, space_id, item_id, viewer)
        assert started.deadline_at is None
        assert _status_code_of(space_attempt_service.require_no_open_attempt, db_session, user=viewer) == 409

        _submit(db_session, space_id, started, viewer)
        assert _status_code_of(space_attempt_service.require_no_open_attempt, db_session, user=viewer) is None

    def test_the_block_is_per_user(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        _start(db_session, space_id, item_id, viewer)
        assert _status_code_of(space_attempt_service.require_no_open_attempt, db_session, user=owner) is None

    def test_start_answers_carry_the_server_clock(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, time_limit_minutes=5)
        viewer = _viewer(db_session, space_id)
        before = space_progress_service.utcnow()
        started = _start(db_session, space_id, item_id, viewer)
        resumed = _start(db_session, space_id, item_id, viewer)
        assert before <= started.server_now <= space_progress_service.utcnow()
        assert resumed.resumed is True and resumed.server_now >= started.server_now


# ---------------------------------------------------------------------------
# Publish with open attempts and old results
# ---------------------------------------------------------------------------


class TestPublishAndAttempts:
    def test_open_attempt_is_graded_on_its_old_version(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        started = _start(db_session, space_id, item_id, viewer)
        _edit_title_of_first_question(db_session, owner, space_id, item_id)
        _publish(db_session, owner, space_id)
        db_session.expire_all()

        # The attempt still runs on the old question (the "to go" -> "ir" version), with the old ids.
        resumed = _start(db_session, space_id, item_id, viewer)
        assert resumed.attempt_id == started.attempt_id
        assert [q.prompt for q in resumed.test.questions] == ["to go"]
        assert [q.id for q in resumed.test.questions] == [q.id for q in started.test.questions]

        result = _submit(db_session, space_id, started, viewer, "ir")
        assert result.score == 100.0  # type: ignore[attr-defined]
        assert result.is_older_version is True  # type: ignore[attr-defined]
        # The next attempt gets the new version.
        fresh = _start(db_session, space_id, item_id, viewer)
        assert [q.prompt for q in fresh.test.questions] == ["to come"]

    def test_reset_removes_completion_and_course_done(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer)
        member = db_session.scalars(select(SpaceMember).where(SpaceMember.user_id == viewer.id)).one()
        assert member.completed_at is not None

        draft_item_id = _edit_title_of_first_question(db_session, owner, space_id, item_id)
        _publish(db_session, owner, space_id, reset_item_ids=[draft_item_id])
        db_session.expire_all()

        item = space_service.get_course(db_session, space_id=space_id, current_user=viewer).sections[0].items[0]
        assert item.completed is False
        assert (
            db_session.scalars(select(SpaceMember).where(SpaceMember.user_id == viewer.id)).one().completed_at is None
        )

    def test_a_low_attempt_after_a_reset_does_not_complete_the_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer)
        draft_item_id = _edit_title_of_first_question(db_session, owner, space_id, item_id)
        _publish(db_session, owner, space_id, reset_item_ids=[draft_item_id])
        db_session.expire_all()

        def shown() -> SpaceItemRead:
            return space_service.get_course(db_session, space_id=space_id, current_user=viewer).sections[0].items[0]

        # Right after the reset the old pass is gone from the score too.
        assert shown().best_score is None
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "wrong")
        db_session.expire_all()

        assert shown().completed is False
        assert shown().best_score == 0
        member = db_session.scalars(select(SpaceMember).where(SpaceMember.user_id == viewer.id)).one()
        assert member.completed_at is None
        # A pass after the reset completes the item again.
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "venir")
        db_session.expire_all()
        assert shown().completed is True

    def test_attempts_count_from_zero_after_a_reset(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, max_attempts=1, cooldown_hours=24)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer)
        assert _status_code(_start, db_session, space_id=space_id, item_id=item_id, user=viewer) == 409

        draft_item_id = _edit_title_of_first_question(db_session, owner, space_id, item_id)
        _publish(db_session, owner, space_id, reset_item_ids=[draft_item_id])
        db_session.expire_all()

        item = space_service.get_course(db_session, space_id=space_id, current_user=viewer).sections[0].items[0]
        assert (item.attempts_left, item.next_attempt_at, item.best_score) == (1, None, None)
        # The old attempt does not block: the cooldown and the limit start again.
        assert _start(db_session, space_id, item_id, viewer).attempt_id is not None

    def test_a_publish_without_a_reset_keeps_the_attempts(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, max_attempts=1)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer)
        _edit_title_of_first_question(db_session, owner, space_id, item_id)
        _publish(db_session, owner, space_id)
        db_session.expire_all()

        assert _status_code(_start, db_session, space_id=space_id, item_id=item_id, user=viewer) == 409
        assert db_session.get(SpaceItem, item_id).progress_reset_at is None  # type: ignore[union-attr]

    def test_the_reset_time_is_set_only_on_the_reset_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        draft_item_id = _edit_title_of_first_question(db_session, owner, space_id, item_id)
        _publish(db_session, owner, space_id, reset_item_ids=[draft_item_id])
        db_session.expire_all()
        item = db_session.get(SpaceItem, item_id)
        assert item is not None and item.progress_reset_at is not None
        # The next edit session starts a draft without the reset time.
        space_draft_service.enter_edit_mode(db_session, space_id=space_id, current_user=owner)
        draft = _test_items(db_session, space_id, is_draft=True)[0]
        assert draft.progress_reset_at is None

    def test_no_reset_keeps_completion(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer)
        _edit_title_of_first_question(db_session, owner, space_id, item_id)
        _publish(db_session, owner, space_id)
        db_session.expire_all()

        item = space_service.get_course(db_session, space_id=space_id, current_user=viewer).sections[0].items[0]
        assert item.completed is True

    def test_new_item_clears_course_completion(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer)

        detail = space_draft_service.enter_edit_mode(db_session, space_id=space_id, current_user=owner)
        assert detail.draft_sections is not None
        space_draft_service.copy_item(
            db_session,
            space_id=space_id,
            current_user=owner,
            data=SpaceItemCopy(section_id=detail.draft_sections[0].id, note_id=new_note(db_session, user=owner).id),
        )
        _publish(db_session, owner, space_id)
        db_session.expire_all()

        assert (
            db_session.scalars(select(SpaceMember).where(SpaceMember.user_id == viewer.id)).one().completed_at is None
        )


# ---------------------------------------------------------------------------
# Notes: mark done, visit
# ---------------------------------------------------------------------------


class TestNotesAndVisit:
    def _course_with_note(self, db: Session, owner: User) -> tuple[str, str]:
        data = SpaceCreate(title="N", visibility=SpaceVisibility.PUBLIC)
        course = space_service.create_course(db, current_user=owner, data=data)
        course = space_draft_service.add_section(
            db, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
        )
        assert course.draft_sections is not None
        space_draft_service.copy_item(
            db,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=course.draft_sections[0].id, note_id=new_note(db, user=owner).id),
        )
        _publish(db, owner, course.id)
        detail = space_service.get_course(db, space_id=course.id, current_user=owner)
        return course.id, detail.sections[0].items[0].id

    def test_mark_and_unmark(self, db_session: Session, owner: User) -> None:
        space_id, item_id = self._course_with_note(db_session, owner)
        viewer = _viewer(db_session, space_id)

        done = space_member_service.set_item_completed(
            db_session, space_id=space_id, item_id=item_id, current_user=viewer, completed=True
        )
        assert done.percent == 100
        member = db_session.scalars(select(SpaceMember).where(SpaceMember.user_id == viewer.id)).one()
        assert member.completed_at is not None

        undone = space_member_service.set_item_completed(
            db_session, space_id=space_id, item_id=item_id, current_user=viewer, completed=False
        )
        assert undone.percent == 0 and member.completed_at is None

    def test_author_preview_has_no_rows(self, db_session: Session, owner: User) -> None:
        space_id, item_id = self._course_with_note(db_session, owner)
        progress = space_member_service.set_item_completed(
            db_session, space_id=space_id, item_id=item_id, current_user=owner, completed=True
        )
        assert progress.completed_items == 0

    def test_a_test_item_can_not_be_marked(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        assert (
            _status_code(
                space_member_service.set_item_completed,
                db_session,
                space_id=space_id,
                item_id=item_id,
                current_user=viewer,
                completed=True,
            )
            == 409
        )

    def test_archived_refuses_mark(self, db_session: Session, owner: User) -> None:
        space_id, item_id = self._course_with_note(db_session, owner)
        viewer = _viewer(db_session, space_id)
        space_service.set_archived(db_session, space_id=space_id, current_user=owner, archived=True)
        assert (
            _status_code(
                space_member_service.set_item_completed,
                db_session,
                space_id=space_id,
                item_id=item_id,
                current_user=viewer,
                completed=True,
            )
            == 409
        )

    def test_visit_sets_the_last_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id = self._course_with_note(db_session, owner)
        viewer = _viewer(db_session, space_id)
        space_member_service.record_visit(db_session, space_id=space_id, item_id=item_id, current_user=viewer)
        member = db_session.scalars(select(SpaceMember).where(SpaceMember.user_id == viewer.id)).one()
        assert member.last_item_id == item_id and member.last_accessed_at is not None
        progress = space_service.get_course(db_session, space_id=space_id, current_user=viewer).progress
        assert progress is not None and progress.last_item_id == item_id


# ---------------------------------------------------------------------------
# Results: answer key per reveal policy
# ---------------------------------------------------------------------------


def _answer_key_visible(test: object) -> bool:
    questions = test.questions
    return any("answers" in q.content.model_dump() and q.content.model_dump()["answers"] for q in questions)


class TestResultTest:
    @pytest.mark.parametrize(
        "reveal,passed,visible",
        [
            (RevealAnswers.ALWAYS, False, True),
            (RevealAnswers.NEVER, True, False),
            (RevealAnswers.AFTER_PASS_OR_LAST, False, False),
            (RevealAnswers.AFTER_PASS_OR_LAST, True, True),
        ],
    )
    def test_reveal_policy(
        self, db_session: Session, owner: User, reveal: RevealAnswers, passed: bool, visible: bool
    ) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, reveal_answers=reveal)
        viewer = _viewer(db_session, space_id)
        result = _submit(
            db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "ir" if passed else "no"
        )

        test = test_result_service.get_result_test(db_session, result_id=result.id, current_user=viewer)
        assert _answer_key_visible(test) is visible
        assert all(getattr(q, "explanation", None) is None for q in test.questions) or visible

    @pytest.mark.parametrize("passed", [False, True])
    def test_rubric_points_follow_reveal(self, db_session: Session, owner: User, passed: bool) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, reveal_answers=RevealAnswers.AFTER_PASS_OR_LAST)
        viewer = _viewer(db_session, space_id)
        result = _submit(
            db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "ir" if passed else "no"
        )
        result.answers[0].rubric_result = [{"point": "secret", "met": False, "weight": 1.0, "reason": "why"}]
        db_session.flush()

        read = test_result_service.get_result_read(db_session, result_id=result.id, current_user=viewer)
        rubric = read.answers[0].rubric_result or []
        assert rubric[0].point == ("secret" if passed else "")
        assert rubric[0].reason == "why"

    def test_last_attempt_reveals(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, max_attempts=1)
        viewer = _viewer(db_session, space_id)
        result = _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer, "no")
        test = test_result_service.get_result_test(db_session, result_id=result.id, current_user=viewer)
        assert _answer_key_visible(test) is True

    def test_personal_result_is_full(self, db_session: Session, owner: User) -> None:
        test = test_service.create_test(
            db_session,
            current_user=owner,
            data=TestCreate.model_validate(
                {"title": "P", "questions": [{"questionType": 1, "prompt": "a", "content": {"answers": ["b"]}}]}
            ),
        )
        from app.schemas.correction import TestSubmission as Submission
        from app.services import correction_service

        result = correction_service.correct_test(
            db_session,
            test_id=test.id,
            current_user=owner,
            submission=Submission.model_validate(
                {"answers": [{"question_id": test.questions[0].id, "user_answer": "b"}]}
            ),
        )
        full = test_result_service.get_result_test(db_session, result_id=result.id, current_user=owner)
        assert _answer_key_visible(full) is True

    def test_other_users_result_is_404(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner)
        viewer = _viewer(db_session, space_id)
        result = _submit(db_session, space_id, _start(db_session, space_id, item_id, viewer), viewer)
        other = _viewer(db_session, space_id)
        assert _status_code(
            test_result_service.get_result_test, db_session, result_id=result.id, current_user=other
        ) in (403, 404)


def test_viewer_cannot_take_a_course_test_through_the_old_route(db_session: Session, owner: User) -> None:
    space_id, _, test_id = _course_with_test(db_session, owner)
    viewer = _viewer(db_session, space_id)
    assert _status_code(test_service.get_takeable_test, db_session, test_id=test_id, current_user=viewer) == 403


class _FakeLLM:
    """An LLM client that always answers with `reply` (the grading and challenge calls use `complete`)."""

    name = "fake"

    def __init__(self, reply: dict[str, list[dict[str, object]]]) -> None:
        self._text = json.dumps(reply)

    def complete(self, **_: object) -> CompletionResult:
        return CompletionResult(text=self._text, input_tokens=1, output_tokens=1, provider="anthropic", model="test")


def _background_session_factory(db: Session) -> Callable[[], Session]:
    """What `SessionLocal` gives a background task: its own session (autoflush off) on the test transaction."""
    db.flush()
    return lambda: Session(bind=db.get_bind(), join_transaction_mode="create_savepoint", autoflush=False)


def _grade_in_background(db: Session, result_id: str, reply: list[dict[str, object]]) -> None:
    with (
        patch.object(grading_service, "SessionLocal", _background_session_factory(db)),
        patch.object(grading_service, "resolve_llm", side_effect=resolve_to(_FakeLLM({"results": reply}))),
    ):
        grading_service.grade_pending_answers(result_id)
    db.expire_all()


def _is_done(db: Session, item_id: str, user: User) -> bool:
    return item_id in space_item_completion_crud.list_completed_ids(db, user_id=user.id, item_ids=[item_id])


def _submit_long_text(db: Session, space_id: str, item_id: str, viewer: User) -> TestResult:
    result = _submit(db, space_id, _start(db, space_id, item_id, viewer), viewer, "a long answer")
    assert isinstance(result, TestResult) and result.pending_answers == 1
    return result


class TestExplanationsInAttempt:
    """An explanation can give the answer away: the exam of an attempt never has it (all policies)."""

    @staticmethod
    def _explain_the_question(db: Session, test_id: str) -> None:
        question = db.scalars(select(Question).where(Question.test_id == test_id)).one()
        question.explanation = "ir means to go"
        db.flush()

    @pytest.mark.parametrize("policy", list(RevealAnswers))
    def test_a_new_attempt_has_no_explanation(self, db_session: Session, owner: User, policy: RevealAnswers) -> None:
        space_id, item_id, test_id = _course_with_test(db_session, owner, reveal_answers=policy)
        self._explain_the_question(db_session, test_id)
        start = _start(db_session, space_id, item_id, _viewer(db_session, space_id))
        assert [q.explanation for q in start.test.questions] == [None]

    def test_a_resumed_attempt_has_no_explanation(self, db_session: Session, owner: User) -> None:
        space_id, item_id, test_id = _course_with_test(db_session, owner)
        self._explain_the_question(db_session, test_id)
        viewer = _viewer(db_session, space_id)
        _start(db_session, space_id, item_id, viewer)
        resumed = _start(db_session, space_id, item_id, viewer)
        assert resumed.resumed is True
        assert [q.explanation for q in resumed.test.questions] == [None]

    def test_the_author_preview_has_no_explanation(self, db_session: Session, owner: User) -> None:
        space_id, item_id, test_id = _course_with_test(db_session, owner)
        self._explain_the_question(db_session, test_id)
        preview = _start(db_session, space_id, item_id, owner)
        assert [q.explanation for q in preview.test.questions] == [None]


class TestBackgroundGrading:
    """Completion after the background grading and after a challenge (autoflush is off, as in production)."""

    def test_pending_result_does_not_complete_the_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, long_text=True)
        viewer = _viewer(db_session, space_id)
        _submit_long_text(db_session, space_id, item_id, viewer)
        assert _is_done(db_session, item_id, viewer) is False

    def test_a_good_grade_completes_the_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, long_text=True)
        viewer = _viewer(db_session, space_id)
        result = _submit_long_text(db_session, space_id, item_id, viewer)
        result_id = result.id

        _grade_in_background(
            db_session,
            result_id,
            [{"index": 0, "met": True, "reason": "ok"}, {"index": 1, "met": True, "reason": "ok"}],
        )

        assert _is_done(db_session, item_id, viewer) is True
        graded = db_session.get(TestResult, result_id)
        assert graded is not None and graded.pending_answers == 0 and graded.score == 100

    def test_a_low_grade_does_not_complete_the_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, long_text=True, pass_threshold=0.8)
        viewer = _viewer(db_session, space_id)
        result = _submit_long_text(db_session, space_id, item_id, viewer)

        _grade_in_background(
            db_session,
            result.id,
            [{"index": 0, "met": True, "reason": "ok"}, {"index": 1, "met": False, "reason": "missing"}],
        )

        assert _is_done(db_session, item_id, viewer) is False

    def test_a_challenge_over_the_threshold_completes_the_item(self, db_session: Session, owner: User) -> None:
        space_id, item_id, _ = _course_with_test(db_session, owner, long_text=True, pass_threshold=0.8)
        viewer = _viewer(db_session, space_id)
        result = _submit_long_text(db_session, space_id, item_id, viewer)
        result_id = result.id
        _grade_in_background(
            db_session,
            result_id,
            [{"index": 0, "met": True, "reason": "ok"}, {"index": 1, "met": False, "reason": "missing"}],
        )
        assert _is_done(db_session, item_id, viewer) is False

        answer = db_session.scalars(select(Answer).where(Answer.test_result_id == result_id)).one()
        challenge_service.challenge_answer(
            db_session,
            answer_id=answer.id,
            request=ChallengeRequest.model_validate({"criteria": [{"criterionIndex": 1, "argument": "I wrote it"}]}),
            user_id=viewer.id,
        )
        answer_id = answer.id
        with (
            patch.object(challenge_service, "SessionLocal", _background_session_factory(db_session)),
            patch.object(
                challenge_service,
                "resolve_llm",
                side_effect=resolve_to(_FakeLLM({"results": [{"index": 1, "met": True, "reason": "fair"}]})),
            ),
        ):
            challenge_service.process_challenge(answer_id)
        db_session.expire_all()

        assert _is_done(db_session, item_id, viewer) is True
        rechecked = db_session.get(TestResult, result_id)
        assert rechecked is not None and rechecked.score == 100
