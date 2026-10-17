"""Bulk queries on the notes and tests of a space (the draft engine and delete forever)."""

from collections.abc import Sequence

from sqlalchemy import delete as sql_delete
from sqlalchemy import or_, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session

from app.core.enums import GroupStatus, QuestionStatus
from app.models.answer import Answer
from app.models.note import Note
from app.models.question import Question
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.models.test_result import TestResult
from app.models.user_question_state import UserQuestionState


def list_test_ids(db: Session, *, space_id: str) -> Sequence[str]:
    """Every test row of the space: published, drafts, deleted and frozen copies (they keep `space_id`)."""
    return db.scalars(select(Test.id).where(Test.space_id == space_id)).all()


def list_draft_note_ids(db: Session, *, space_id: str) -> Sequence[str]:
    return db.scalars(select(Note.id).where(Note.space_id == space_id, Note.is_draft.is_(True))).all()


def list_draft_test_ids(db: Session, *, space_id: str) -> Sequence[str]:
    return db.scalars(select(Test.id).where(Test.space_id == space_id, Test.is_draft.is_(True))).all()


def lock_draft_content(db: Session, *, space_id: str) -> None:
    """Lock the draft notes and tests of the space (SELECT ... FOR UPDATE) until the transaction ends."""
    db.execute(select(Note.id).where(Note.space_id == space_id, Note.is_draft.is_(True)).with_for_update())
    db.execute(select(Test.id).where(Test.space_id == space_id, Test.is_draft.is_(True)).with_for_update())


def list_notes(db: Session, *, ids: Sequence[str]) -> Sequence[Note]:
    if not ids:
        return []
    return db.scalars(select(Note).where(Note.id.in_(ids))).all()


def list_tests(db: Session, *, ids: Sequence[str]) -> Sequence[Test]:
    if not ids:
        return []
    return db.scalars(select(Test).where(Test.id.in_(ids))).all()


def list_note_twins(db: Session, *, published_ids: Sequence[str]) -> Sequence[Note]:
    """The draft twins of the published notes `published_ids`."""
    if not published_ids:
        return []
    stmt = select(Note).where(Note.draft_of_id.in_(published_ids), Note.is_draft.is_(True))
    return db.scalars(stmt).all()


def list_test_twins(db: Session, *, published_ids: Sequence[str]) -> Sequence[Test]:
    """The draft twins of the published tests `published_ids`."""
    if not published_ids:
        return []
    stmt = select(Test).where(Test.draft_of_id.in_(published_ids), Test.is_draft.is_(True))
    return db.scalars(stmt).all()


def delete_notes(db: Session, *, ids: Sequence[str]) -> None:
    """Hard delete. The DB cascade removes chunks, twins and items; `test.source_note_id` becomes NULL."""
    if ids:
        db.execute(sql_delete(Note).where(Note.id.in_(ids)))
        db.flush()


def delete_tests_forever(db: Session, *, test_ids: Sequence[str]) -> None:
    """Hard delete tests with all their rows, children first.

    The child FKs (`question.test_id`, `answer.question_id`, `test_result.test_id`, …) have no
    `ondelete`, so a DB cascade from `test` would fail. This also deletes the exam history of
    these tests: callers use it only for drafts (no results) and for "delete space forever".
    """
    if not test_ids:
        return
    group_ids = db.scalars(select(TestQuestionGroup.id).where(TestQuestionGroup.test_id.in_(test_ids))).all()
    question_ids = db.scalars(
        select(Question.id).where(or_(Question.test_id.in_(test_ids), Question.group_id.in_(group_ids)))
    ).all()
    result_ids = db.scalars(select(TestResult.id).where(TestResult.test_id.in_(test_ids))).all()

    db.execute(
        sql_delete(Answer).where(or_(Answer.test_result_id.in_(result_ids), Answer.question_id.in_(question_ids)))
    )
    db.execute(sql_delete(UserQuestionState).where(UserQuestionState.question_id.in_(question_ids)))
    db.execute(sql_delete(TestResult).where(TestResult.id.in_(result_ids)))
    db.execute(sql_delete(Question).where(Question.id.in_(question_ids)))
    db.execute(sql_delete(TestQuestionGroup).where(TestQuestionGroup.id.in_(group_ids)))
    db.execute(sql_delete(Test).where(Test.id.in_(test_ids)))
    db.flush()


def retire_test_children(db: Session, *, test_id: str) -> None:
    """Mark the ACTIVE questions and groups of a test DELETED (grouped questions too)."""
    group_ids = select(TestQuestionGroup.id).where(TestQuestionGroup.test_id == test_id)
    db.execute(
        sql_update(Question)
        .where(
            or_(Question.test_id == test_id, Question.group_id.in_(group_ids)),
            Question.status == int(QuestionStatus.ACTIVE),
        )
        .values(status=int(QuestionStatus.DELETED))
    )
    db.execute(
        sql_update(TestQuestionGroup)
        .where(TestQuestionGroup.test_id == test_id, TestQuestionGroup.status == int(GroupStatus.ACTIVE))
        .values(status=int(GroupStatus.DELETED))
    )
    db.flush()


def move_test_children(db: Session, *, from_test_id: str, to_test_id: str) -> None:
    """Move the standalone questions and the groups of a test to another test.

    Grouped questions have `test_id = NULL` and follow their group. Call `retire_test_children`
    on the target first: the `(test_id, order)` unique indexes count ACTIVE rows only.
    """
    db.execute(sql_update(Question).where(Question.test_id == from_test_id).values(test_id=to_test_id))
    db.execute(
        sql_update(TestQuestionGroup).where(TestQuestionGroup.test_id == from_test_id).values(test_id=to_test_id)
    )
    db.flush()
