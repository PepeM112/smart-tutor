"""A frozen test version (`Test.parent_id` set) is read-only: edit paths give 404, reads still load it.

Each test runs in one outer transaction that is rolled back (see `db_session` in `conftest.py`).
"""

from collections.abc import Callable

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import QuestionStatus
from app.models.question import Question
from app.models.test import Test as ExamTest
from app.models.test_result import TestResult as ResultRow
from app.models.user import User
from app.schemas.question import QuestionUpdate
from app.schemas.test import TestUpdate
from app.services import question_service, test_result_service, test_service
from app.services.assist_tools import execute_tool
from app.services.versioning_service import version_test_if_needed
from tests.space_factories import new_bank_question, new_test, new_user

pytestmark = pytest.mark.db


@pytest.fixture
def user(db_session: Session) -> User:
    return new_user(db_session)


class _Versions:
    """A personal test that has one result, so `version_test_if_needed` freezes a copy of it."""

    def __init__(self, db: Session, user: User) -> None:
        self.current = new_test(db, user=user)
        self.result = ResultRow(test_id=self.current.id, user_id=user.id, total_questions=1, correct_answers=1)
        db.add(self.result)
        db.flush()
        assert version_test_if_needed(db, test=self.current) is True
        self.frozen = db.scalars(select(ExamTest).where(ExamTest.parent_id == self.current.id)).one()
        self.frozen_question = db.scalars(select(Question).where(Question.test_id == self.frozen.id)).one()
        # `execute_tool` rolls the session back on an error: commit so the rows survive it.
        db.commit()


@pytest.fixture
def versions(db_session: Session, user: User) -> _Versions:
    return _Versions(db_session, user)


def _status_code(db: Session, call: Callable[..., object], **kwargs: object) -> int:
    with pytest.raises(HTTPException) as exc_info:
        call(db, **kwargs)
    return exc_info.value.status_code


class TestFrozenVersionIsReadOnly:
    def test_get_test_gives_404(self, db_session: Session, user: User, versions: _Versions) -> None:
        assert _status_code(db_session, test_service.get_test, test_id=versions.frozen.id, current_user=user) == 404

    def test_update_test_gives_404(self, db_session: Session, user: User, versions: _Versions) -> None:
        code = _status_code(
            db_session,
            test_service.update_test,
            test_id=versions.frozen.id,
            current_user=user,
            data=TestUpdate(title="Changed"),
        )
        assert code == 404

    def test_delete_test_gives_404(self, db_session: Session, user: User, versions: _Versions) -> None:
        assert _status_code(db_session, test_service.delete_test, test_id=versions.frozen.id, current_user=user) == 404

    def test_assign_question_to_a_frozen_test_gives_404(
        self, db_session: Session, user: User, versions: _Versions
    ) -> None:
        bank_question = new_bank_question(db_session, user=user)
        code = _status_code(
            db_session,
            question_service.assign_question_to_test,
            question_id=bank_question.id,
            test_id=versions.frozen.id,
            current_user=user,
        )
        assert code == 404

    def test_update_a_question_of_a_frozen_test_gives_404(
        self, db_session: Session, user: User, versions: _Versions
    ) -> None:
        code = _status_code(
            db_session,
            question_service.update_question,
            question_id=versions.frozen_question.id,
            current_user=user,
            data=QuestionUpdate(prompt="Changed"),
        )
        assert code == 404

    def test_delete_a_question_of_a_frozen_test_gives_404(
        self, db_session: Session, user: User, versions: _Versions
    ) -> None:
        code = _status_code(
            db_session,
            question_service.delete_question,
            question_id=versions.frozen_question.id,
            current_user=user,
        )
        assert code == 404


class TestVersioningGuard:
    def test_a_frozen_version_is_never_copied_again(self, db_session: Session, versions: _Versions) -> None:
        # Force skips the "has results" check, so only the frozen guard can return False here.
        assert version_test_if_needed(db_session, test=versions.frozen, force=True) is False


class TestFrozenVersionInAssistantTools:
    def test_get_test_details_loads_the_frozen_version_and_names_the_live_test(
        self, db_session: Session, user: User, versions: _Versions
    ) -> None:
        output = execute_tool(
            db_session, current_user=user, tool_name="get_test_details", arguments={"test_id": versions.frozen.id}
        ).output
        assert f"(ID: `{versions.frozen.id}`)" in output
        assert "Older version of this test" in output
        assert f"The live test is `{versions.current.id}`" in output
        assert f"(qid: `{versions.frozen_question.id}`)" in output

    def test_get_test_details_of_the_live_test_has_no_older_version_line(
        self, db_session: Session, user: User, versions: _Versions
    ) -> None:
        output = execute_tool(
            db_session, current_user=user, tool_name="get_test_details", arguments={"test_id": versions.current.id}
        ).output
        assert "Older version" not in output

    def test_get_test_details_of_a_frozen_version_of_another_user_is_denied(
        self, db_session: Session, versions: _Versions
    ) -> None:
        output = execute_tool(
            db_session,
            current_user=new_user(db_session),
            tool_name="get_test_details",
            arguments={"test_id": versions.frozen.id},
        ).output
        assert output == "Error: Access denied"

    def test_edit_test_says_not_found_and_keeps_the_title(
        self, db_session: Session, user: User, versions: _Versions
    ) -> None:
        output = execute_tool(
            db_session,
            current_user=user,
            tool_name="edit_test",
            arguments={"test_id": versions.frozen.id, "title": "Changed"},
        ).output
        assert output == "Error: Test not found"
        frozen = db_session.get(ExamTest, versions.frozen.id)
        assert frozen is not None
        assert frozen.title == "Test"

    def test_refine_questions_says_not_found(self, db_session: Session, user: User, versions: _Versions) -> None:
        output = execute_tool(
            db_session,
            current_user=user,
            tool_name="refine_questions",
            arguments={
                "test_id": versions.frozen.id,
                "question_ids": [versions.frozen_question.id],
                "instructions": "Shorter",
            },
        ).output
        assert output == "Error: Test not found"


class TestBulkActionsSkipFrozenQuestions:
    def test_bulk_delete_skips_the_frozen_question_and_creates_no_version(
        self, db_session: Session, user: User, versions: _Versions
    ) -> None:
        tests_before = db_session.scalar(select(func.count()).select_from(ExamTest))
        frozen_question_id = versions.frozen_question.id

        deleted = question_service.bulk_delete_questions(
            db_session, question_ids=[frozen_question_id], current_user=user
        )

        assert deleted == []
        assert db_session.get(Question, frozen_question_id) is not None
        assert db_session.scalar(select(func.count()).select_from(ExamTest)) == tests_before


class TestCurrentVersionStaysEditable:
    def test_update_test_works(self, db_session: Session, user: User, versions: _Versions) -> None:
        updated = test_service.update_test(
            db_session, test_id=versions.current.id, current_user=user, data=TestUpdate(title="Changed")
        )
        assert updated.title == "Changed"

    def test_get_test_details_works(self, db_session: Session, user: User, versions: _Versions) -> None:
        output = execute_tool(
            db_session, current_user=user, tool_name="get_test_details", arguments={"test_id": versions.current.id}
        ).output
        assert not output.startswith("Error")


class TestResultPageStillLoadsTheFrozenTest:
    def test_result_test_is_the_frozen_version(self, db_session: Session, user: User, versions: _Versions) -> None:
        assert versions.result.test_id == versions.frozen.id
        read = test_result_service.get_result_test(db_session, result_id=versions.result.id, current_user=user)
        assert read.id == versions.frozen.id


class TestRestoreVersionsTheLiveTest:
    def test_restoring_a_question_freezes_the_test_first_when_it_has_results(
        self, db_session: Session, user: User
    ) -> None:
        live = new_test(db_session, user=user)
        kept = db_session.scalars(select(Question).where(Question.test_id == live.id)).one()
        trashed = Question(user_id=user.id, test_id=live.id, prompt="to come", order=1, content={"answers": ["venir"]})
        db_session.add_all([ResultRow(test_id=live.id, user_id=user.id, total_questions=2, correct_answers=2), trashed])
        db_session.flush()
        question_service.bulk_delete_questions(
            db_session, question_ids=[trashed.id], current_user=user, force_soft_delete=True
        )
        # The delete froze the test and moved the first result there: a second result makes it versionable again.
        db_session.add(ResultRow(test_id=live.id, user_id=user.id, total_questions=1, correct_answers=1))
        db_session.flush()
        frozen_before = db_session.scalars(select(ExamTest).where(ExamTest.parent_id == live.id)).all()

        restored = question_service.restore_questions(db_session, question_ids=[trashed.id], current_user=user)

        assert restored == 1
        frozen = db_session.scalars(
            select(ExamTest).where(ExamTest.parent_id == live.id).order_by(ExamTest.version)
        ).all()
        assert len(frozen) == len(frozen_before) + 1
        # The newest frozen copy holds the content from before the restore: only the kept question.
        newest_prompts = db_session.scalars(select(Question.prompt).where(Question.test_id == frozen[-1].id)).all()
        assert newest_prompts == [kept.prompt]
        live_prompts = db_session.scalars(
            select(Question.prompt).where(Question.test_id == live.id, Question.status == int(QuestionStatus.ACTIVE))
        ).all()
        assert sorted(live_prompts) == ["to come", "to go"]
