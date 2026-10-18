"""ST-68 Phase B: grade overrides, teacher access to results, gradebook, AI key resolution, spend
(real DB, each test is rolled back, no real LLM call)."""

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import event, select, update
from sqlalchemy.orm import Session

from app.core.enums import (
    AIFeature,
    AIProvider,
    AnswerStatus,
    GradeCellStatus,
    KeySource,
    KeyStatus,
    MemberStatus,
    QuestionType,
    SpaceItemKind,
    SpaceRole,
    SpaceVisibility,
)
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import token_usage as token_usage_crud
from app.models.answer import Answer
from app.models.classroom_settings import ClassroomSettings
from app.models.question import Question
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.test_result import TestResult
from app.models.token_usage import TokenUsage
from app.models.user import User
from app.schemas.answer import ChallengeRequest
from app.schemas.classroom_grades import GradebookCell, GradebookRead
from app.schemas.correction import TestSubmission
from app.schemas.space import (
    ClassroomCourseCreate,
    ClassroomCreate,
    ClassroomSettingsRead,
    ClassroomSettingsUpdate,
    SpaceAttemptStart,
    SpaceCreate,
    SpaceItemCopy,
    SpacePublishRequest,
    SpaceSectionCreate,
)
from app.schemas.test import TestRead
from app.services import (
    challenge_service,
    classroom_ai_service,
    classroom_service,
    encryption,
    grade_override_service,
    gradebook_service,
    grading_service,
    llm,
    llm_key_service,
    space_attempt_service,
    space_draft_service,
    space_member_service,
    space_service,
    test_result_service,
    token_usage_service,
)
from app.services.llm import (
    CAP_REACHED_MESSAGE,
    KEY_UNREADABLE_MESSAGE,
    NO_KEY_MESSAGE,
    AIKeyError,
    CompletionResult,
)
from tests.llm_fakes import resolve_to
from tests.space_factories import add_member, new_test, new_user

pytestmark = pytest.mark.db


def _status_code(service_call: Callable[..., object], db: Session, **kwargs: object) -> int:
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return exc_info.value.status_code


def _detail(service_call: Callable[..., object], db: Session, **kwargs: object) -> str:
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return str(exc_info.value.detail)


@pytest.fixture
def owner(db_session: Session) -> User:
    return new_user(db_session)


# ── Builders ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Room:
    """A published classroom with one loose TEST item and one course with one TEST item."""

    classroom_id: str
    course_id: str
    loose_item_id: str
    course_item_id: str


def _section(db: Session, user: User, space_id: str) -> str:
    detail = space_draft_service.add_section(
        db, space_id=space_id, current_user=user, data=SpaceSectionCreate(title="S")
    )
    assert detail.draft_sections
    return detail.draft_sections[-1].id


def _source_test(db: Session, user: User, *, long_text: bool) -> str:
    """A test with one question: "to go" -> "ir". `long_text`: a Long Text question with two criteria instead."""
    source = new_test(db, user=user)
    if long_text:
        question = source.questions[0]
        question.question_type = int(QuestionType.LONG_TEXT)
        question.content = {
            "length_limit": 1,
            "rubric": [{"point": "first", "weight": 0.5}, {"point": "second", "weight": 0.5}],
        }
        db.flush()
    return source.id


def _published_items(db: Session, space_id: str) -> list[SpaceItem]:
    stmt = select(SpaceItem).where(
        SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(False), SpaceItem.kind == int(SpaceItemKind.TEST)
    )
    return list(db.scalars(stmt).all())


def _room(db: Session, owner: User, *, long_text: bool = False) -> Room:
    """`long_text` applies to the course item. The loose item is always a simple question."""
    classroom = classroom_service.create_classroom(db, current_user=owner, data=ClassroomCreate(title="Class"))
    loose_section = _section(db, owner, classroom.id)
    space_draft_service.copy_item(
        db,
        space_id=classroom.id,
        current_user=owner,
        data=SpaceItemCopy(section_id=loose_section, test_id=_source_test(db, owner, long_text=False)),
    )
    course_section = _section(db, owner, classroom.id)
    course = classroom_service.add_course(
        db,
        classroom_id=classroom.id,
        current_user=owner,
        data=ClassroomCourseCreate(title="Course", section_id=course_section),
    )
    inner_section = _section(db, owner, course.id)
    space_draft_service.copy_item(
        db,
        space_id=course.id,
        current_user=owner,
        data=SpaceItemCopy(section_id=inner_section, test_id=_source_test(db, owner, long_text=long_text)),
    )
    for space_id in (course.id, classroom.id):
        space_draft_service.publish(
            db, space_id=space_id, current_user=owner, data=SpacePublishRequest.model_validate({})
        )
    return Room(
        classroom_id=classroom.id,
        course_id=course.id,
        loose_item_id=_published_items(db, classroom.id)[0].id,
        course_item_id=_published_items(db, course.id)[0].id,
    )


def _student(db: Session, room: Room) -> User:
    student = new_user(db)
    classroom = db.get(Space, room.classroom_id)
    assert classroom is not None
    add_member(db, space=classroom, user=student, role=SpaceRole.VIEWER)
    return student


def _teacher(db: Session, room: Room) -> User:
    teacher = new_user(db)
    classroom = db.get(Space, room.classroom_id)
    assert classroom is not None
    add_member(db, space=classroom, user=teacher, role=SpaceRole.EDITOR)
    return teacher


def _start(db: Session, space_id: str, item_id: str, user: User) -> SpaceAttemptStart:
    return space_attempt_service.start_attempt(db, space_id=space_id, item_id=item_id, current_user=user)


def _take(db: Session, space_id: str, item_id: str, user: User, user_answer: str = "ir") -> TestResult:
    """Start and submit an attempt. A Long Text answer is PENDING (no background task runs here)."""
    start = _start(db, space_id, item_id, user)
    assert start.attempt_id is not None
    result = space_attempt_service.submit_attempt(
        db,
        space_id=space_id,
        attempt_id=start.attempt_id,
        current_user=user,
        submission=TestSubmission.model_validate(
            {"answers": [{"question_id": q.id, "user_answer": user_answer} for q in start.test.questions]}
        ),
        background_tasks=BackgroundTasks(),
    )
    assert isinstance(result, TestResult)
    return result


def _answer(db: Session, result_id: str) -> Answer:
    return db.scalars(select(Answer).where(Answer.test_result_id == result_id)).one()


def _points(db: Session, answer: Answer) -> float:
    question = db.get(Question, answer.question_id)
    assert question is not None
    return question.points


def _is_done(db: Session, item_id: str, user: User) -> bool:
    return item_id in space_item_completion_crud.list_completed_ids(db, user_id=user.id, item_ids=[item_id])


class _FakeLLM:
    """An LLM client that always answers with `reply` (the grading call uses `complete`)."""

    name = "fake"

    def __init__(self, reply: list[dict[str, object]]) -> None:
        self._text = json.dumps({"results": reply})

    def complete(self, **_: object) -> CompletionResult:
        return CompletionResult(text=self._text, input_tokens=3, output_tokens=4, provider="anthropic", model="test")


def _grade_in_background(
    db: Session, result_id: str, reply: list[dict[str, object]], *, key_source: KeySource = KeySource.STUDENT
) -> list[tuple[str, str | None]]:
    """Run the background grader as production does: its own session.

    Returns the (user id, space id) of each key resolution (the user object is detached afterwards).
    """
    db.flush()
    calls: list[tuple[str, str | None]] = []
    fake = resolve_to(_FakeLLM(reply), key_source=key_source)

    def resolver(session: Session, user: User, space_id: str | None = None) -> Any:
        calls.append((user.id, space_id))
        return fake(session, user, space_id)

    def factory() -> Session:
        return Session(bind=db.get_bind(), join_transaction_mode="create_savepoint", autoflush=False)

    with (
        patch.object(grading_service, "SessionLocal", factory),
        patch.object(grading_service, "resolve_llm", side_effect=resolver),
    ):
        grading_service.grade_pending_answers(result_id)
    db.expire_all()
    return calls


BOTH_MET = [{"index": 0, "met": True, "reason": "ok"}, {"index": 1, "met": True, "reason": "ok"}]
NONE_MET = [{"index": 0, "met": False, "reason": "no"}, {"index": 1, "met": False, "reason": "no"}]


# ── Grade override (R35) ──────────────────────────────────────────────────────


class TestOverride:
    def test_a_teacher_passes_a_wrong_answer(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        result = _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
        answer = _answer(db_session, result.id)
        assert answer.status == AnswerStatus.WRONG and result.score == 0
        assert _is_done(db_session, room.loose_item_id, student) is False

        updated = grade_override_service.set_override(
            db_session, answer_id=answer.id, score=_points(db_session, answer), current_user=owner
        )

        assert updated.score == 100
        assert _is_done(db_session, room.loose_item_id, student) is True
        changed = _answer(db_session, result.id)
        assert changed.override_status == AnswerStatus.CORRECT
        assert changed.overridden_by == owner.id and changed.overridden_at is not None
        # The AI (auto) grade stays.
        assert changed.status == AnswerStatus.WRONG

    def test_an_editor_may_override_and_a_partial_score_gives_partial(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        teacher = _teacher(db_session, room)
        result = _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
        answer = _answer(db_session, result.id)

        updated = grade_override_service.set_override(
            db_session, answer_id=answer.id, score=_points(db_session, answer) / 2, current_user=teacher
        )

        assert updated.score == 50
        assert _answer(db_session, result.id).override_status == AnswerStatus.PARTIAL

    def test_clear_returns_to_the_auto_grade(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        result = _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
        answer = _answer(db_session, result.id)
        grade_override_service.set_override(db_session, answer_id=answer.id, score=1, current_user=owner)

        cleared = grade_override_service.clear_override(db_session, answer_id=answer.id, current_user=owner)

        assert cleared.score == 0
        back = _answer(db_session, result.id)
        assert back.override_score is None and back.override_status is None
        assert back.overridden_by is None and back.overridden_at is None

    def test_a_fail_override_keeps_an_earned_completion(self, db_session: Session, owner: User) -> None:
        """Progress is sticky: a later low score never removes a pass, and an override is no exception."""
        room = _room(db_session, owner)
        student = _student(db_session, room)
        result = _take(db_session, room.classroom_id, room.loose_item_id, student, "ir")
        assert _is_done(db_session, room.loose_item_id, student) is True

        updated = grade_override_service.set_override(
            db_session, answer_id=_answer(db_session, result.id).id, score=0, current_user=owner
        )

        assert updated.score == 0
        assert _is_done(db_session, room.loose_item_id, student) is True

    def test_a_pending_long_text_answer_may_be_overridden(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner, long_text=True)
        student = _student(db_session, room)
        result = _take(db_session, room.course_id, room.course_item_id, student, "a long answer")
        assert result.pending_answers == 1
        answer = _answer(db_session, result.id)
        assert answer.status == AnswerStatus.PENDING

        updated = grade_override_service.set_override(
            db_session, answer_id=answer.id, score=_points(db_session, answer), current_user=owner
        )

        assert updated.pending_answers == 0 and updated.score == 100
        assert _is_done(db_session, room.course_item_id, student) is True

    def test_the_background_grader_never_overwrites_an_override(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner, long_text=True)
        student = _student(db_session, room)
        result = _take(db_session, room.course_id, room.course_item_id, student, "a long answer")
        result_id = result.id
        answer = _answer(db_session, result_id)
        answer_id, points = answer.id, _points(db_session, answer)
        grade_override_service.set_override(db_session, answer_id=answer_id, score=points, current_user=owner)

        _grade_in_background(db_session, result_id, NONE_MET)

        graded = db_session.get(TestResult, result_id)
        assert graded is not None and graded.score == 100 and graded.pending_answers == 0
        kept = db_session.get(Answer, answer_id)
        assert kept is not None and kept.override_score == points and kept.override_status == AnswerStatus.CORRECT
        # The grader skips the answer: no AI grade is stored. Clearing the override grades it later.
        assert kept.status == AnswerStatus.PENDING

    def test_the_grader_skips_an_overridden_answer_before_it_resolves_a_key(
        self, db_session: Session, owner: User
    ) -> None:
        room = _room(db_session, owner, long_text=True)
        student = _student(db_session, room)
        result = _take(db_session, room.course_id, room.course_item_id, student, "a long answer")
        result_id = result.id
        answer = _answer(db_session, result_id)
        answer_id, points = answer.id, _points(db_session, answer)
        grade_override_service.set_override(db_session, answer_id=answer_id, score=points, current_user=owner)

        calls = _grade_in_background(db_session, result_id, NONE_MET)

        # No key lookup: with no key the grader would mark the overridden answer FAILED.
        assert calls == []
        kept = db_session.get(Answer, answer_id)
        assert kept is not None and kept.status == AnswerStatus.PENDING

    def test_an_override_made_during_the_ai_call_is_kept(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner, long_text=True)
        student = _student(db_session, room)
        result = _take(db_session, room.course_id, room.course_item_id, student, "a long answer")
        result_id = result.id
        answer = _answer(db_session, result_id)
        answer_id, points = answer.id, _points(db_session, answer)

        class _OverridingLLM(_FakeLLM):
            """The teacher sets the override while the AI call runs."""

            def complete(self, **kwargs: object) -> CompletionResult:
                # No commit here: the test session already has its savepoint (older than the one of the grader
                # session), and a commit would release it while the grader session runs on the same connection.
                db_session.execute(
                    update(Answer)
                    .where(Answer.id == answer_id)
                    .values(override_score=points, override_status=int(AnswerStatus.CORRECT), overridden_by=owner.id)
                )
                return super().complete(**kwargs)

        fake = resolve_to(_OverridingLLM(NONE_MET))

        def factory() -> Session:
            return Session(bind=db_session.get_bind(), join_transaction_mode="create_savepoint", autoflush=False)

        with (
            patch.object(grading_service, "SessionLocal", factory),
            patch.object(grading_service, "resolve_llm", side_effect=fake),
        ):
            grading_service.grade_pending_answers(result_id)
        db_session.expire_all()

        graded = db_session.get(TestResult, result_id)
        assert graded is not None and graded.score == 100 and graded.pending_answers == 0
        kept = db_session.get(Answer, answer_id)
        assert kept is not None and kept.override_score == points

    def test_clearing_a_pending_override_makes_the_answer_pending_again(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner, long_text=True)
        student = _student(db_session, room)
        result = _take(db_session, room.course_id, room.course_item_id, student, "a long answer")
        answer_id = _answer(db_session, result.id).id
        grade_override_service.set_override(db_session, answer_id=answer_id, score=1, current_user=owner)

        cleared = grade_override_service.clear_override(db_session, answer_id=answer_id, current_user=owner)

        assert cleared.pending_answers == 1
        assert _answer(db_session, result.id).status == AnswerStatus.PENDING

    def test_a_student_cannot_challenge_an_overridden_answer(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner, long_text=True)
        student = _student(db_session, room)
        result = _take(db_session, room.course_id, room.course_item_id, student, "a long answer")
        result_id = result.id
        _grade_in_background(db_session, result_id, NONE_MET)
        answer_id = _answer(db_session, result_id).id
        grade_override_service.set_override(db_session, answer_id=answer_id, score=0.5, current_user=owner)

        request = ChallengeRequest.model_validate({"criteria": [{"criterionIndex": 0, "argument": "I wrote it"}]})
        kwargs: dict[str, Any] = {"answer_id": answer_id, "request": request, "user_id": student.id}
        assert _status_code(challenge_service.challenge_answer, db_session, **kwargs) == 409
        assert _detail(challenge_service.challenge_answer, db_session, **kwargs) == (
            challenge_service.OVERRIDDEN_ANSWER_MESSAGE
        )

    def test_refused_cases(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        other_student = _student(db_session, room)
        stranger = new_user(db_session)
        result = _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
        answer = _answer(db_session, result.id)
        base: dict[str, Any] = {"answer_id": answer.id, "score": 1}

        # The student himself, another student and a stranger: 403.
        for user in (student, other_student, stranger):
            assert _status_code(grade_override_service.set_override, db_session, current_user=user, **base) == 403
            assert (
                _status_code(grade_override_service.clear_override, db_session, answer_id=answer.id, current_user=user)
                == 403
            )
        assert (
            _status_code(
                grade_override_service.set_override, db_session, answer_id="missing", score=1, current_user=owner
            )
            == 404
        )
        # More than the points of the question: 400.
        too_high = {"answer_id": answer.id, "score": _points(db_session, answer) + 1}
        assert _status_code(grade_override_service.set_override, db_session, current_user=owner, **too_high) == 400
        # An archived classroom is read-only: 409.
        space_service.set_archived(db_session, space_id=room.classroom_id, current_user=owner, archived=True)
        assert _status_code(grade_override_service.set_override, db_session, current_user=owner, **base) == 409

    def test_a_standalone_course_has_no_overrides(self, db_session: Session, owner: User) -> None:
        course = space_service.create_course(
            db_session, current_user=owner, data=SpaceCreate(title="Solo", visibility=SpaceVisibility.PUBLIC)
        )
        course = space_draft_service.add_section(
            db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
        )
        assert course.draft_sections
        space_draft_service.copy_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(
                section_id=course.draft_sections[0].id, test_id=_source_test(db_session, owner, long_text=False)
            ),
        )
        space_draft_service.publish(
            db_session, space_id=course.id, current_user=owner, data=SpacePublishRequest.model_validate({})
        )
        item_id = _published_items(db_session, course.id)[0].id
        viewer = new_user(db_session)
        space_member_service.join(db_session, space_id=course.id, current_user=viewer)
        result = _take(db_session, course.id, item_id, viewer, "wrong")

        kwargs: dict[str, Any] = {"answer_id": _answer(db_session, result.id).id, "score": 1, "current_user": owner}
        assert _status_code(grade_override_service.set_override, db_session, **kwargs) == 400
        assert _detail(grade_override_service.set_override, db_session, **kwargs) == (
            "Grade overrides are only available in classrooms"
        )


# ── Teacher access to a student result ────────────────────────────────────────


class TestTeacherAccess:
    def test_teachers_read_the_result_and_its_test_with_answers(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        teacher = _teacher(db_session, room)
        result_id = _take(db_session, room.classroom_id, room.loose_item_id, student).id

        for reader in (owner, teacher, student):
            read = test_result_service.get_result_read(db_session, result_id=result_id, current_user=reader)
            assert read.id == result_id and len(read.answers) == 1
        exam = test_result_service.get_result_test(db_session, result_id=result_id, current_user=teacher)
        assert isinstance(exam, TestRead)

    def test_can_override_is_true_only_for_teachers(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        teacher = _teacher(db_session, room)
        result_id = _take(db_session, room.classroom_id, room.loose_item_id, student).id

        def can_override(reader: User) -> bool:
            return test_result_service.get_result_read(
                db_session, result_id=result_id, current_user=reader
            ).can_override

        assert [can_override(owner), can_override(teacher), can_override(student)] == [True, True, False]

    def test_can_override_is_false_for_a_standalone_course_result(self, db_session: Session, owner: User) -> None:
        course = space_service.create_course(
            db_session, current_user=owner, data=SpaceCreate(title="Solo", visibility=SpaceVisibility.PRIVATE)
        )
        section = _section(db_session, owner, course.id)
        space_draft_service.copy_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=section, test_id=_source_test(db_session, owner, long_text=False)),
        )
        space_draft_service.publish(
            db_session, space_id=course.id, current_user=owner, data=SpacePublishRequest.model_validate({})
        )
        item = _published_items(db_session, course.id)[0]
        student = new_user(db_session)
        space = db_session.get(Space, course.id)
        assert space is not None
        add_member(db_session, space=space, user=student, role=SpaceRole.VIEWER)
        result_id = _take(db_session, course.id, item.id, student).id

        # A standalone course has no teacher grades (R12).
        read = test_result_service.get_result_read(db_session, result_id=result_id, current_user=student)
        assert read.can_override is False

    def test_other_students_and_strangers_are_refused(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        result_id = _take(db_session, room.classroom_id, room.loose_item_id, student).id

        for reader in (_student(db_session, room), new_user(db_session)):
            kwargs: dict[str, Any] = {"result_id": result_id, "current_user": reader}
            assert _status_code(test_result_service.get_result_read, db_session, **kwargs) == 403
            assert _status_code(test_result_service.get_result_test, db_session, **kwargs) == 403

    def test_a_teacher_of_another_classroom_is_refused(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        result_id = _take(db_session, room.classroom_id, room.loose_item_id, student).id
        other_owner = new_user(db_session)
        _room(db_session, other_owner)

        assert (
            _status_code(test_result_service.get_result_read, db_session, result_id=result_id, current_user=other_owner)
            == 403
        )


# ── Gradebook (R34) ───────────────────────────────────────────────────────────


def _book(db: Session, room: Room, user: User) -> GradebookRead:
    db.expire_all()
    return gradebook_service.get_gradebook(db, classroom_id=room.classroom_id, current_user=user)


def _cell(book: GradebookRead, user: User, item_id: str) -> GradebookCell:
    row = next(r for r in book.rows if r.user_id == user.id)
    return next(c for c in row.cells if c.item_id == item_id)


class TestGradebook:
    def test_columns_rows_and_access(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        teacher = _teacher(db_session, room)
        classroom = db_session.get(Space, room.classroom_id)
        assert classroom is not None
        add_member(
            db_session, space=classroom, user=new_user(db_session), role=SpaceRole.VIEWER,
            member_status=MemberStatus.INVITED,
        )  # fmt: skip

        book = _book(db_session, room, teacher)

        # Loose items first, then the items of each course.
        assert [(c.item_id, c.course_id) for c in book.columns] == [
            (room.loose_item_id, None),
            (room.course_item_id, room.course_id),
        ]
        assert [c.course_id for c in book.courses] == [room.course_id]
        assert book.columns[0].title == "Test" and book.courses[0].total_items == 1
        # Only ACTIVE students are rows. The teacher is not a row.
        assert [r.user_id for r in book.rows] == [student.id]
        assert len(book.rows[0].cells) == 2 and len(book.rows[0].courses) == 1
        assert (
            _status_code(
                gradebook_service.get_gradebook, db_session, classroom_id=room.classroom_id, current_user=student
            )
            == 403
        )
        assert _status_code(
            gradebook_service.get_gradebook, db_session, classroom_id=room.classroom_id,
            current_user=new_user(db_session),
        ) == 403  # fmt: skip

    def test_cell_statuses(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner, long_text=True)
        passed, failed, idle, open_attempt, pending = (_student(db_session, room) for _ in range(5))
        passed_result = _take(db_session, room.classroom_id, room.loose_item_id, passed, "ir")
        failed_result = _take(db_session, room.classroom_id, room.loose_item_id, failed, "wrong")
        _start(db_session, room.classroom_id, room.loose_item_id, open_attempt)
        _take(db_session, room.course_id, room.course_item_id, pending, "a long answer")

        book = _book(db_session, room, owner)

        def status(user: User, item_id: str) -> GradeCellStatus:
            return _cell(book, user, item_id).status

        assert status(passed, room.loose_item_id) == GradeCellStatus.PASSED
        assert status(failed, room.loose_item_id) == GradeCellStatus.FAILED
        assert status(idle, room.loose_item_id) == GradeCellStatus.NOT_STARTED
        assert status(open_attempt, room.loose_item_id) == GradeCellStatus.IN_PROGRESS
        assert status(pending, room.course_item_id) == GradeCellStatus.PENDING
        done = _cell(book, passed, room.loose_item_id)
        assert done.best_score == 100 and done.attempts_used == 1 and done.best_result_id == passed_result.id
        bad = _cell(book, failed, room.loose_item_id)
        assert bad.best_score == 0 and bad.best_result_id == failed_result.id
        # A pending result has no score yet.
        waiting = _cell(book, pending, room.course_item_id)
        assert waiting.best_score is None and waiting.attempts_used == 1
        assert _cell(book, idle, room.loose_item_id).attempts_used == 0

    def test_the_best_result_wins(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
        best = _take(db_session, room.classroom_id, room.loose_item_id, student, "ir")
        _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")

        cell = _cell(_book(db_session, room, owner), student, room.loose_item_id)

        assert cell.best_score == 100 and cell.best_result_id == best.id and cell.attempts_used == 3

    def test_an_override_is_flagged_and_counts(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        result = _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
        assert _cell(_book(db_session, room, owner), student, room.loose_item_id).overridden is False

        grade_override_service.set_override(
            db_session, answer_id=_answer(db_session, result.id).id, score=1, current_user=owner
        )

        cell = _cell(_book(db_session, room, owner), student, room.loose_item_id)
        assert cell.overridden is True and cell.status == GradeCellStatus.PASSED and cell.best_score == 100

    def test_course_percent(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        # The loose item does not count for the course.
        _take(db_session, room.classroom_id, room.loose_item_id, student, "ir")
        assert _book(db_session, room, owner).rows[0].courses[0].percent == 0

        _take(db_session, room.course_id, room.course_item_id, student, "ir")

        progress = _book(db_session, room, owner).rows[0].courses[0]
        assert (progress.completed_items, progress.percent) == (1, 100)

    def test_hidden_items_are_in_the_gradebook_and_marked(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        _student(db_session, room)
        item = db_session.get(SpaceItem, room.loose_item_id)
        assert item is not None
        item.visible_from = datetime.now(timezone.utc) + timedelta(days=3)
        db_session.flush()

        book = _book(db_session, room, owner)

        assert {c.item_id: c.hidden for c in book.columns} == {room.loose_item_id: True, room.course_item_id: False}

    def test_results_before_a_progress_reset_do_not_count(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
        item = db_session.get(SpaceItem, room.loose_item_id)
        assert item is not None
        item.progress_reset_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        db_session.flush()

        cell = _cell(_book(db_session, room, owner), student, room.loose_item_id)

        assert (cell.status, cell.best_score, cell.attempts_used, cell.best_result_id) == (
            GradeCellStatus.NOT_STARTED,
            None,
            0,
            None,
        )

    def test_the_query_count_does_not_grow_with_the_students(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner, long_text=True)
        first = _student(db_session, room)
        _take(db_session, room.classroom_id, room.loose_item_id, first, "ir")

        def count_queries() -> int:
            statements: list[str] = []

            def listener(*args: Any) -> None:
                statements.append(args[2])

            bind = db_session.get_bind()
            event.listen(bind, "before_cursor_execute", listener)
            try:
                _book(db_session, room, owner)
            finally:
                event.remove(bind, "before_cursor_execute", listener)
            return len(statements)

        few = count_queries()
        for _ in range(6):
            student = _student(db_session, room)
            _take(db_session, room.classroom_id, room.loose_item_id, student, "wrong")
            _take(db_session, room.course_id, room.course_item_id, student, "a long answer")
        many = count_queries()

        assert len(_book(db_session, room, owner).rows) == 7
        assert many == few


# ── AI key resolution (R36-R38) ───────────────────────────────────────────────


def _give_student_key(user: User) -> None:
    user.encrypted_anthropic_key = encryption.encrypt("student-secret")


def _set_class_key(db: Session, owner: User, room: Room, **settings: object) -> None:
    data: dict[str, object] = {"aiProvider": 1, "classKey": "class-secret", **settings}
    classroom_service.update_settings(
        db, classroom_id=room.classroom_id, current_user=owner, data=ClassroomSettingsUpdate.model_validate(data)
    )


def _book_usage(
    db: Session, user: User, space_id: str | None, source: KeySource, tokens: int = 10, *, age_days: int = 0
) -> None:
    row = token_usage_crud.create(
        db,
        user_id=user.id,
        provider=AIProvider.ANTHROPIC,
        model="test",
        feature=AIFeature.ASSIST,
        input_tokens=tokens,
        output_tokens=0,
        space_id=space_id,
        key_source=source,
    )
    if age_days:
        row.created_at = datetime.now(timezone.utc) - timedelta(days=age_days)
        db.flush()


@pytest.fixture
def fake_clients() -> Any:
    """Clients are plain objects with the key that built them. No real client is made."""
    with (
        patch.object(llm_key_service, "build_client", side_effect=lambda provider, key: SimpleNamespace(key=key)),
        patch.object(llm_key_service, "get_user_llm_client", side_effect=lambda user: SimpleNamespace(key="student")),
    ):
        yield


@pytest.mark.usefixtures("fake_clients")
class TestKeyResolution:
    def test_no_key_at_all_is_refused(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        for space_id in (room.classroom_id, None):
            with pytest.raises(AIKeyError) as error:
                llm_key_service.resolve_llm(db_session, student, space_id)
            assert str(error.value) == NO_KEY_MESSAGE and error.value.cap_reached is False

    def test_the_student_key_only(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _give_student_key(student)

        in_class = llm_key_service.resolve_llm(db_session, student, room.course_id)
        personal = llm_key_service.resolve_llm(db_session, student)

        assert (in_class.key_source, in_class.space_id) == (KeySource.STUDENT, room.course_id)
        assert (personal.key_source, personal.space_id) == (KeySource.STUDENT, None)

    def test_the_class_key_only_serves_a_student_in_the_classroom_content(
        self, db_session: Session, owner: User
    ) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room)

        resolved = llm_key_service.resolve_llm(db_session, student, room.course_id)

        assert (resolved.key_source, resolved.space_id) == (KeySource.CLASS, room.course_id)
        assert resolved.client.key == "class-secret"  # type: ignore[attr-defined]
        # Scope CLASSROOM_CONTENT: a personal call gets nothing.
        with pytest.raises(AIKeyError):
            llm_key_service.resolve_llm(db_session, student)

    def test_a_teacher_and_the_owner_do_not_get_the_class_key(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        _set_class_key(db_session, owner, room, keyScope=2)
        stranger = new_user(db_session)
        for user in (owner, _teacher(db_session, room), stranger):
            for space_id in (room.classroom_id, None):
                with pytest.raises(AIKeyError):
                    llm_key_service.resolve_llm(db_session, user, space_id)

    def test_a_student_that_left_loses_the_class_key(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room)
        space_member_service.leave(db_session, space_id=room.classroom_id, current_user=student)

        with pytest.raises(AIKeyError):
            llm_key_service.resolve_llm(db_session, student, room.classroom_id)

    @pytest.mark.parametrize(("priority", "expected"), [(1, KeySource.STUDENT), (2, KeySource.CLASS)])
    def test_priority_decides_when_both_keys_exist(
        self, db_session: Session, owner: User, priority: int, expected: KeySource
    ) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _give_student_key(student)
        _set_class_key(db_session, owner, room, keyPriority=priority)

        assert llm_key_service.resolve_llm(db_session, student, room.classroom_id).key_source == expected

    def test_over_the_cap_falls_back_to_the_student_key(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _give_student_key(student)
        _set_class_key(db_session, owner, room, keyPriority=2, monthlyTokenCapPerStudent=100)
        _book_usage(db_session, student, room.course_id, KeySource.CLASS, 99)
        assert llm_key_service.resolve_llm(db_session, student, room.classroom_id).key_source == KeySource.CLASS

        _book_usage(db_session, student, room.classroom_id, KeySource.CLASS, 1)

        assert llm_key_service.resolve_llm(db_session, student, room.classroom_id).key_source == KeySource.STUDENT

    def test_over_the_cap_without_a_student_key_is_blocked(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room, monthlyTokenCapPerStudent=100)
        _book_usage(db_session, student, room.course_id, KeySource.CLASS, 100)

        with pytest.raises(AIKeyError) as error:
            llm_key_service.resolve_llm(db_session, student, room.classroom_id)

        assert str(error.value) == CAP_REACHED_MESSAGE and error.value.cap_reached is True

    def test_the_cap_counts_only_class_key_spend_of_this_month(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room, monthlyTokenCapPerStudent=100)
        # Own-key spend, spend of an old month and spend of another student do not count.
        _book_usage(db_session, student, room.course_id, KeySource.STUDENT, 500)
        _book_usage(db_session, student, room.course_id, KeySource.CLASS, 500, age_days=70)
        _book_usage(db_session, _student(db_session, room), room.course_id, KeySource.CLASS, 500)

        assert llm_key_service.resolve_llm(db_session, student, room.classroom_id).key_source == KeySource.CLASS

    def test_scope_all_lets_a_personal_call_use_the_class_key(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room, keyScope=2)

        resolved = llm_key_service.resolve_llm(db_session, student)

        # The usage is booked on the classroom, so the owner sees the spend.
        assert (resolved.key_source, resolved.space_id) == (KeySource.CLASS, room.classroom_id)

    def test_scope_all_with_a_student_key_that_goes_first_keeps_the_personal_booking(
        self, db_session: Session, owner: User
    ) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _give_student_key(student)
        _set_class_key(db_session, owner, room, keyScope=2, keyPriority=1)

        resolved = llm_key_service.resolve_llm(db_session, student)

        assert (resolved.key_source, resolved.space_id) == (KeySource.STUDENT, None)

    def test_a_personal_call_skips_a_classroom_over_its_cap(self, db_session: Session, owner: User) -> None:
        first = _room(db_session, owner)
        student = _student(db_session, first)
        second_owner = new_user(db_session)
        second = _room(db_session, second_owner)
        classroom = db_session.get(Space, second.classroom_id)
        assert classroom is not None
        add_member(db_session, space=classroom, user=student, role=SpaceRole.VIEWER)
        _set_class_key(db_session, owner, first, keyScope=2, monthlyTokenCapPerStudent=10)
        _set_class_key(db_session, second_owner, second, keyScope=2)
        _book_usage(db_session, student, first.classroom_id, KeySource.CLASS, 10)

        resolved = llm_key_service.resolve_llm(db_session, student)

        assert (resolved.key_source, resolved.space_id) == (KeySource.CLASS, second.classroom_id)

    def test_usage_is_recorded_with_the_space_and_the_key_source(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room)
        resolved = llm_key_service.resolve_llm(db_session, student, room.course_id)
        completion = CompletionResult(text="", input_tokens=5, output_tokens=7, provider="anthropic", model="test")

        token_usage_service.record_usage(
            db_session, user_id=student.id, result=resolved.tag(completion), feature=AIFeature.GRADING
        )

        row = db_session.scalars(select(TokenUsage).where(TokenUsage.user_id == student.id)).one()
        assert (row.space_id, row.key_source) == (room.course_id, int(KeySource.CLASS))

    def test_the_background_grader_resolves_the_key_of_the_student_for_the_test_space(
        self, db_session: Session, owner: User
    ) -> None:
        room = _room(db_session, owner, long_text=True)
        student = _student(db_session, room)
        student_id = student.id
        result_id = _take(db_session, room.course_id, room.course_item_id, student, "a long answer").id

        calls = _grade_in_background(db_session, result_id, BOTH_MET, key_source=KeySource.CLASS)

        assert calls == [(student_id, room.course_id)]
        row = db_session.scalars(select(TokenUsage).where(TokenUsage.user_id == student_id)).one()
        assert (row.space_id, row.key_source) == (room.course_id, int(KeySource.CLASS))


# ── ai-key-status and token-usage (R36, R39) ──────────────────────────────────


@pytest.mark.usefixtures("fake_clients")
class TestKeyStatusAndSpend:
    def test_key_status_of_a_student(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        kwargs: dict[str, Any] = {"classroom_id": room.classroom_id, "current_user": student}
        assert classroom_ai_service.get_key_status(db_session, **kwargs).status == KeyStatus.NONE

        _give_student_key(student)
        own = classroom_ai_service.get_key_status(db_session, **kwargs)
        assert (own.status, own.cap_reached, own.monthly_token_cap) == (KeyStatus.STUDENT, False, None)

        _set_class_key(db_session, owner, room, keyPriority=2, monthlyTokenCapPerStudent=100)
        _book_usage(db_session, student, room.course_id, KeySource.CLASS, 40)
        shared = classroom_ai_service.get_key_status(db_session, **kwargs)
        assert (shared.status, shared.tokens_used_this_month, shared.monthly_token_cap) == (KeyStatus.CLASS, 40, 100)

        _book_usage(db_session, student, room.classroom_id, KeySource.CLASS, 60)
        full = classroom_ai_service.get_key_status(db_session, **kwargs)
        assert (full.status, full.cap_reached) == (KeyStatus.STUDENT, True)

    def test_key_status_without_a_student_key_when_the_cap_is_used(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room, monthlyTokenCapPerStudent=10)
        _book_usage(db_session, student, room.course_id, KeySource.CLASS, 10)

        status = classroom_ai_service.get_key_status(db_session, classroom_id=room.classroom_id, current_user=student)

        assert (status.status, status.cap_reached) == (KeyStatus.NONE, True)

    def test_key_status_of_a_teacher_and_a_stranger(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        _set_class_key(db_session, owner, room)
        teacher = _teacher(db_session, room)

        status = classroom_ai_service.get_key_status(db_session, classroom_id=room.classroom_id, current_user=teacher)

        assert (status.status, status.monthly_token_cap) == (KeyStatus.NONE, None)
        assert (
            _status_code(
                classroom_ai_service.get_key_status,
                db_session,
                classroom_id=room.classroom_id,
                current_user=new_user(db_session),
            )
            == 403
        )

    def test_token_usage_is_for_the_owner_only(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        for user in (_teacher(db_session, room), _student(db_session, room), new_user(db_session)):
            assert (
                _status_code(
                    classroom_ai_service.get_token_usage,
                    db_session,
                    classroom_id=room.classroom_id,
                    current_user=user,
                )
                == 403
            )

    def test_token_usage_per_student_split_by_source(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        busy, quiet = _student(db_session, room), _student(db_session, room)
        _book_usage(db_session, busy, room.course_id, KeySource.CLASS, 10)
        _book_usage(db_session, busy, room.classroom_id, KeySource.STUDENT, 5)
        _book_usage(db_session, busy, room.classroom_id, KeySource.CLASS, 100, age_days=70)
        # Personal use (no space) is not in the classroom spend.
        _book_usage(db_session, busy, None, KeySource.STUDENT, 1000)

        usage = classroom_ai_service.get_token_usage(db_session, classroom_id=room.classroom_id, current_user=owner)

        by_user = {s.user_id: s for s in usage.students}
        assert set(by_user) == {busy.id, quiet.id}
        row = by_user[busy.id]
        assert (row.month_tokens, row.total_tokens, row.is_active) == (15, 115, True)
        split = {s.key_source: (s.month_tokens, s.total_tokens) for s in row.by_source}
        assert split == {KeySource.CLASS: (10, 110), KeySource.STUDENT: (5, 5)}
        # An active student without usage has a zero row.
        assert (by_user[quiet.id].total_tokens, by_user[quiet.id].by_source) == (0, [])

    def test_a_student_who_left_keeps_the_past_spend(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _book_usage(db_session, student, room.course_id, KeySource.CLASS, 10)
        space_member_service.leave(db_session, space_id=room.classroom_id, current_user=student)

        usage = classroom_ai_service.get_token_usage(db_session, classroom_id=room.classroom_id, current_user=owner)

        row = next(s for s in usage.students if s.user_id == student.id)
        assert (row.is_active, row.total_tokens) == (False, 10)


# ── Audit fixes: archived key, provider change, unreadable key, teachers in the spend ─────────────


def _settings(db: Session, owner: User, room: Room, **fields: object) -> ClassroomSettingsRead:
    return classroom_service.update_settings(
        db,
        classroom_id=room.classroom_id,
        current_user=owner,
        data=ClassroomSettingsUpdate.model_validate(fields),
    )


@pytest.mark.usefixtures("fake_clients")
class TestArchivedClassroomKey:
    def test_an_archived_classroom_has_no_class_key(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room, keyScope=2)
        assert llm_key_service.plan_key(db_session, student, room.course_id).source == KeySource.CLASS

        space_service.set_archived(db_session, space_id=room.classroom_id, current_user=owner, archived=True)

        # No student key: the same as "no class key".
        for space_id in (room.classroom_id, room.course_id, None):
            plan = llm_key_service.plan_key(db_session, student, space_id)
            assert (plan.source, plan.message) == (None, NO_KEY_MESSAGE)
            with pytest.raises(AIKeyError):
                llm_key_service.resolve_llm(db_session, student, space_id)
        # With a student key: the student key pays, and the key status says so.
        _give_student_key(student)
        resolved = llm_key_service.resolve_llm(db_session, student, room.course_id)
        assert resolved.key_source == KeySource.STUDENT
        status = classroom_ai_service.get_key_status(db_session, classroom_id=room.classroom_id, current_user=student)
        assert status.status == KeyStatus.STUDENT

        # Unarchive restores the key (it stayed stored).
        space_service.set_archived(db_session, space_id=room.classroom_id, current_user=owner, archived=False)
        _set_class_key(db_session, owner, room, keyPriority=2)
        assert llm_key_service.plan_key(db_session, student, room.course_id).source == KeySource.CLASS

    def test_an_archived_classroom_only_allows_removing_the_key(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        _set_class_key(db_session, owner, room)
        space_service.set_archived(db_session, space_id=room.classroom_id, current_user=owner, archived=True)
        kwargs: dict[str, Any] = {"classroom_id": room.classroom_id, "current_user": owner}

        for body in (
            {"keyScope": 2},
            {"classKey": "new-value"},
            {"classKey": "", "keyScope": 2},
            {"aiProvider": 2},
            {"monthlyTokenCapPerStudent": 5},
        ):
            code = _status_code(
                classroom_service.update_settings,
                db_session,
                data=ClassroomSettingsUpdate.model_validate(body),
                **kwargs,
            )
            assert code == 409, body
        assert classroom_service.get_settings(db_session, **kwargs).has_class_key

        assert not _settings(db_session, owner, room, classKey="").has_class_key

    def test_a_co_teacher_cannot_remove_the_key_of_an_archived_classroom(
        self, db_session: Session, owner: User
    ) -> None:
        room = _room(db_session, owner)
        _set_class_key(db_session, owner, room)
        space_service.set_archived(db_session, space_id=room.classroom_id, current_user=owner, archived=True)
        code = _status_code(
            classroom_service.update_settings,
            db_session,
            classroom_id=room.classroom_id,
            current_user=_teacher(db_session, room),
            data=ClassroomSettingsUpdate.model_validate({"classKey": ""}),
        )
        assert code == 403


class TestProviderChange:
    detail = "Send a new Class key when you change the provider"

    def _change(self, db: Session, owner: User, room: Room, **fields: object) -> str:
        return _detail(
            classroom_service.update_settings,
            db,
            classroom_id=room.classroom_id,
            current_user=owner,
            data=ClassroomSettingsUpdate.model_validate(fields),
        )

    def test_a_provider_change_needs_a_new_key(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        _set_class_key(db_session, owner, room)  # provider 1 (Anthropic) + key

        assert self._change(db_session, owner, room, aiProvider=2) == self.detail
        assert self._change(db_session, owner, room, aiProvider=None) == self.detail
        stored = db_session.get(ClassroomSettings, room.classroom_id)
        assert stored is not None and stored.ai_provider == 1 and stored.encrypted_class_key

    def test_allowed_provider_changes(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        # No stored key: a provider change is fine.
        assert _settings(db_session, owner, room, aiProvider=2).ai_provider == 2
        _set_class_key(db_session, owner, room)  # provider 1 + key
        # The same provider keeps the key.
        assert _settings(db_session, owner, room, aiProvider=1, keyScope=2).has_class_key
        # A new key in the same request.
        changed = _settings(db_session, owner, room, aiProvider=2, classKey="other-value")
        assert (changed.ai_provider, changed.has_class_key) == (2, True)
        # Provider null together with the removal of the key.
        cleared = _settings(db_session, owner, room, aiProvider=None, classKey="")
        assert (cleared.ai_provider, cleared.has_class_key) == (None, False)


class TestUnreadableKey:
    def test_a_class_key_that_cannot_be_decrypted_is_a_key_error(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student = _student(db_session, room)
        _set_class_key(db_session, owner, room)
        stored = db_session.get(ClassroomSettings, room.classroom_id)
        assert stored is not None
        stored.encrypted_class_key = "not-a-valid-token"
        db_session.flush()

        with pytest.raises(AIKeyError) as error:
            llm_key_service.resolve_llm(db_session, student, room.course_id)
        assert str(error.value) == KEY_UNREADABLE_MESSAGE

    def test_a_user_key_that_cannot_be_decrypted_is_a_key_error(self, db_session: Session) -> None:
        user = new_user(db_session)
        user.encrypted_anthropic_key = "not-a-valid-token"
        user.encrypted_openai_key = "not-a-valid-token"
        for provider in (None, 1, 2):
            user.ai_provider = provider
            with pytest.raises(AIKeyError) as error:
                llm.get_user_llm_client(user)
            assert str(error.value) == KEY_UNREADABLE_MESSAGE
            with pytest.raises(AIKeyError):
                llm_key_service.resolve_llm(db_session, user)


class TestSpendListsStudentsOnly:
    def test_the_owner_and_co_teachers_are_not_listed(self, db_session: Session, owner: User) -> None:
        room = _room(db_session, owner)
        student, teacher = _student(db_session, room), _teacher(db_session, room)
        _book_usage(db_session, student, room.course_id, KeySource.CLASS, 10)
        _book_usage(db_session, teacher, room.classroom_id, KeySource.STUDENT, 7)
        _book_usage(db_session, owner, room.classroom_id, KeySource.STUDENT, 3)

        usage = classroom_ai_service.get_token_usage(db_session, classroom_id=room.classroom_id, current_user=owner)

        assert [s.user_id for s in usage.students] == [student.id]
