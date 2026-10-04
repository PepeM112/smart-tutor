"""Question list and test filters on the real Postgres DB, with grouped questions.

Grouped questions keep `test_id = NULL` and reach their test through `TestQuestionGroup.test_id`.
The mock tests do not run the SQL joins, so these tests do. Each test is rolled back (see `db_session`).
Run with `pytest --run-db tests/test_questions_db.py` (`make test-db`).
"""

from typing import TYPE_CHECKING

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session
from ulid import ULID

from app.api.v1.endpoints import questions as questions_endpoint
from app.core.enums import QuestionStatus, QuestionType
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.models.question import Question
from app.models.user import User
from app.schemas.question import (
    BulkAssignQuestionsRequest,
    BulkDeleteQuestionsRequest,
    BulkRestoreQuestionsRequest,
    QuestionCreate,
    QuestionCreateStandalone,
    SimpleContent,
)
from app.schemas.test import TestCreate, TestUpdate
from app.schemas.test_question_group import TestQuestionGroupCreate
from app.services import question_service, test_service
from app.services.assist_tools.questions import search_questions
from app.services.assist_tools.tests import edit_test_confirm_context
from app.services.versioning_service import _clone_test

if TYPE_CHECKING:
    # Not imported at runtime: pytest would try to collect a class named `Test*`.
    from app.models.test import Test

pytestmark = pytest.mark.db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db_session: Session) -> User:
    tag = str(ULID()).lower()
    new_user = User(username=f"dbtest-{tag}", email=f"dbtest-{tag}@example.com", hashed_password="x")
    db_session.add(new_user)
    db_session.flush()
    return new_user


def _q(prompt: str, *, order: int = 0, points: float = 1.0) -> QuestionCreate:
    return QuestionCreate(
        question_type=QuestionType.SIMPLE,
        prompt=prompt,
        content=SimpleContent(answers=["x"]),
        order=order,
        points=points,
    )


def _test_with_group(db: Session, user: User, title: str = "Grouped test") -> "Test":
    """A test with one standalone question ("solo") and one group with one question ("grouped")."""
    data = TestCreate(
        title=title,
        questions=[_q("solo", order=0)],
        question_groups=[TestQuestionGroupCreate(order=1, title="G", questions=[_q("grouped", order=0)])],
    )
    return test_service.create_test(db, current_user=user, data=data)


def _bank_question(db: Session, user: User, prompt: str = "bank") -> Question:
    data = QuestionCreateStandalone(
        question_type=QuestionType.SIMPLE, prompt=prompt, content=SimpleContent(answers=["x"])
    )
    return question_service.create_question(db, current_user=user, data=data)


def _prompts(db: Session, user: User, **filters: object) -> list[str]:
    questions, _ = question_crud.list_by_user(db, user_id=user.id, **filters)  # type: ignore[arg-type]
    return sorted(q.prompt for q in questions)


# ---------------------------------------------------------------------------
# P0-1: points persist through create_many
# ---------------------------------------------------------------------------


def test_create_test_keeps_points(db_session: Session, user: User) -> None:
    data = TestCreate(
        title="Weighted",
        questions=[_q("a", order=0, points=2.5)],
        question_groups=[TestQuestionGroupCreate(order=1, questions=[_q("b", order=0, points=0.5)])],
    )
    test = test_service.create_test(db_session, current_user=user, data=data)
    loaded = test_crud.get_by_id(db_session, id=test.id)
    assert loaded is not None
    assert [q.points for q in loaded.questions] == [2.5]
    assert [q.points for q in loaded.question_groups[0].questions] == [0.5]


def test_update_test_keeps_points(db_session: Session, user: User) -> None:
    test = test_service.create_test(db_session, current_user=user, data=TestCreate(title="W"))
    update = TestUpdate(questions=[_q("c", order=0, points=3.0)])
    test_service.update_test(db_session, test_id=test.id, current_user=user, data=update)
    loaded = test_crud.get_by_id(db_session, id=test.id)
    assert loaded is not None
    assert [q.points for q in loaded.questions] == [3.0]


# ---------------------------------------------------------------------------
# P0-2: list_by_user resolves the test through the group
# ---------------------------------------------------------------------------


def test_list_shows_grouped_question_with_its_test(db_session: Session, user: User) -> None:
    test = _test_with_group(db_session, user)
    items, total = question_service.list_questions(db_session, current_user=user)
    by_prompt = {item.prompt: item for item in items}
    assert total == 2
    assert by_prompt["grouped"].test_id == test.id
    assert by_prompt["grouped"].test_title == "Grouped test"
    assert by_prompt["grouped"].group_title == "G"
    assert by_prompt["solo"].test_id == test.id


def test_bank_filter_excludes_grouped_questions(db_session: Session, user: User) -> None:
    _test_with_group(db_session, user)
    _bank_question(db_session, user)
    assert _prompts(db_session, user, test_id=["bank"]) == ["bank"]


def test_test_filter_includes_grouped_questions(db_session: Session, user: User) -> None:
    test = _test_with_group(db_session, user)
    _bank_question(db_session, user)
    assert _prompts(db_session, user, test_id=[test.id]) == ["grouped", "solo"]
    assert _prompts(db_session, user, test_id=["bank", test.id]) == ["bank", "grouped", "solo"]


def test_list_excludes_frozen_versions(db_session: Session, user: User) -> None:
    test = _test_with_group(db_session, user)
    loaded = test_crud.get_by_id(db_session, id=test.id)
    assert loaded is not None
    _clone_test(db_session, test=loaded)
    db_session.flush()
    assert _prompts(db_session, user) == ["grouped", "solo"]


def test_list_excludes_questions_of_deleted_tests(db_session: Session, user: User) -> None:
    test = _test_with_group(db_session, user)
    _bank_question(db_session, user)
    test_service.delete_test(db_session, test_id=test.id, current_user=user)
    assert _prompts(db_session, user) == ["bank"]


# ---------------------------------------------------------------------------
# P0-3: test list question_type filter matches grouped questions
# ---------------------------------------------------------------------------


def test_test_list_type_filter_matches_grouped_only_test(db_session: Session, user: User) -> None:
    data = TestCreate(
        title="Only groups",
        question_groups=[TestQuestionGroupCreate(order=0, questions=[_q("g", order=0)])],
    )
    test = test_service.create_test(db_session, current_user=user, data=data)
    tests, _ = test_crud.list_by_user(db_session, user_id=user.id, question_type=[int(QuestionType.SIMPLE)])
    assert [t.id for t in tests] == [test.id]
    tests, _ = test_crud.list_by_user(db_session, user_id=user.id, question_type=[int(QuestionType.MULTIPLE_CHOICE)])
    assert tests == []


# ---------------------------------------------------------------------------
# P0-4: assistant search labels grouped questions with their test
# ---------------------------------------------------------------------------


def test_search_questions_labels_grouped_question(db_session: Session, user: User) -> None:
    test = _test_with_group(db_session, user)
    _bank_question(db_session, user)
    output = search_questions(db_session, current_user=user, arguments={}).output
    lines = {line.split("] ", 1)[1].split(" (", 1)[0]: line for line in output.splitlines()[1:]}
    assert f"in test `{test.id}`" in lines["grouped"]
    assert "in Question Bank" in lines["bank"]


# ---------------------------------------------------------------------------
# P1-4 / P2-4: bulk counts and deleted questions
# ---------------------------------------------------------------------------


def _soft_deleted(db: Session, user: User, prompt: str) -> Question:
    question = _bank_question(db, user, prompt)
    question.status = int(QuestionStatus.DELETED)
    db.flush()
    return question


def _other_user_question(db: Session) -> Question:
    tag = str(ULID()).lower()
    other = User(username=f"dbtest-{tag}", email=f"dbtest-{tag}@example.com", hashed_password="x")
    db.add(other)
    db.flush()
    return _bank_question(db, other, "foreign")


class TestBulkSkippedCounts:
    def test_delete_skips_unowned_deleted_and_unknown_ids(self, db_session: Session, user: User) -> None:
        mine = _bank_question(db_session, user, "mine")
        ids = [mine.id, _soft_deleted(db_session, user, "gone").id, _other_user_question(db_session).id, "nope"]

        response = questions_endpoint.bulk_delete(BulkDeleteQuestionsRequest(question_ids=ids), db_session, user)

        assert (response.deleted, response.skipped) == (1, 3)

    def test_assign_skips_unowned_deleted_and_unknown_ids(self, db_session: Session, user: User) -> None:
        target = test_service.create_test(db_session, current_user=user, data=TestCreate(title="T"))
        ids = [
            _bank_question(db_session, user, "mine").id,
            _soft_deleted(db_session, user, "gone").id,
            _other_user_question(db_session).id,
        ]

        response = questions_endpoint.bulk_assign(
            BulkAssignQuestionsRequest(question_ids=ids, test_id=target.id), db_session, user
        )

        assert (response.assigned, response.skipped) == (1, 2)
        assert _prompts(db_session, user, test_id=[target.id]) == ["mine"]

    def test_restore_skips_unowned_active_and_unknown_ids(self, db_session: Session, user: User) -> None:
        deleted = _soft_deleted(db_session, user, "gone")
        ids = [deleted.id, _bank_question(db_session, user, "active").id, _other_user_question(db_session).id]

        response = questions_endpoint.bulk_restore(BulkRestoreQuestionsRequest(question_ids=ids), db_session, user)

        assert (response.restored, response.skipped) == (1, 2)
        assert deleted.status == int(QuestionStatus.ACTIVE)

    def test_repeated_ids_count_once(self, db_session: Session, user: User) -> None:
        mine = _bank_question(db_session, user, "mine")
        request = BulkDeleteQuestionsRequest(question_ids=[mine.id, mine.id])

        response = questions_endpoint.bulk_delete(request, db_session, user)

        assert (response.deleted, response.skipped) == (1, 0)


class TestDeletedQuestionsAreMissing:
    def test_get_question_of_a_deleted_question_is_404(self, db_session: Session, user: User) -> None:
        deleted = _soft_deleted(db_session, user, "gone")
        with pytest.raises(HTTPException) as exc:
            question_service.get_question(db_session, question_id=deleted.id, current_user=user)
        assert exc.value.status_code == 404

    def test_list_by_ids_hides_deleted_unless_asked(self, db_session: Session, user: User) -> None:
        deleted = _soft_deleted(db_session, user, "gone")
        assert question_crud.list_by_ids(db_session, ids=[deleted.id]) == []
        assert question_crud.list_by_ids(db_session, ids=[deleted.id], active_only=False) == [deleted]

    def test_edit_test_card_lists_only_active_questions_of_that_test(self, db_session: Session, user: User) -> None:
        target = _test_with_group(db_session, user)
        solo = target.questions[0]
        outside = _bank_question(db_session, user, "outside")
        removed = _soft_deleted(db_session, user, "gone")

        context = edit_test_confirm_context(
            db_session,
            current_user=user,
            arguments={"test_id": target.id, "remove_question_ids": [solo.id, outside.id, removed.id]},
        )

        assert context is not None
        assert [q["id"] for q in context["questions_to_remove"]] == [solo.id]
