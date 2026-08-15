import copy
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import cast

import sqlalchemy as sa
from sqlalchemy import Select, UnaryExpression, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session, contains_eager, joinedload

from app.core.enums import QuestionStatus, QuestionType, TestStatus
from app.crud.helpers import token_search
from app.models.answer import Answer
from app.models.question import Question
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.models.user_question_state import UserQuestionState
from app.schemas.question import (
    QuestionCreate,
    QuestionCreateStandalone,
    QuestionGrouping,
    QuestionSortBy,
    QuestionUpdate,
    SortOrder,
)


def get_by_id(db: Session, *, id: str) -> Question | None:
    stmt = select(Question).options(joinedload(Question.question_group)).where(Question.id == id)
    return db.execute(stmt).scalar_one_or_none()


def list_by_test(db: Session, *, test_id: str) -> Sequence[Question]:
    return db.scalars(select(Question).where(Question.test_id == test_id)).all()


def list_by_ids(db: Session, *, ids: list[str]) -> Sequence[Question]:
    """Fetch questions by id, unordered. Used by bulk operations to resolve ownership."""
    stmt = select(Question).options(joinedload(Question.question_group)).where(Question.id.in_(ids))
    return db.scalars(stmt).all()


# Columns the questions list can be sorted by. Question has no `created_at`
# column — ULIDs are lexicographically sortable by creation time, so `id` is
# an accurate proxy and matches the existing default ordering.
_SORT_COLUMNS: dict[str, InstrumentedAttribute[object]] = {
    "prompt": Question.prompt,
    "question_type": Question.question_type,
    "points": Question.points,
    "created_at": Question.id,
}


def _sort_clause(sort_by: QuestionSortBy | None, sort_order: SortOrder) -> UnaryExpression[object]:
    column = _SORT_COLUMNS[sort_by] if sort_by and sort_by in _SORT_COLUMNS else Question.id
    clause = column.asc() if sort_order == "asc" else column.desc()
    # Columns have different underlying Python types (str/int/float), so pyright infers a
    # union here — UnaryExpression's type param is invariant and can't unify them. Safe to
    # erase to `object` since the clause is only ever passed straight into `order_by()`.
    return cast(UnaryExpression[object], clause)


def list_by_user(
    db: Session,
    *,
    user_id: str,
    question_type: list[int] | None = None,
    test_id: list[str] | None = None,
    search: str | None = None,
    grouping: QuestionGrouping | None = None,
    sort_by: QuestionSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[Sequence[Question], int]:
    """Paginated list of a user's questions with optional filters.

    Returns (questions, total_count).
    """
    stmt = (
        select(Question)
        .outerjoin(Test, Question.test_id == Test.id)
        .outerjoin(TestQuestionGroup, Question.group_id == TestQuestionGroup.id)
        .options(contains_eager(Question.test), contains_eager(Question.question_group))
        .where(
            Question.user_id == user_id,
            Question.status == int(QuestionStatus.ACTIVE),
            # Exclude frozen version snapshots (parent_id set); keep bank questions and current versions only
            sa.or_(Question.test_id.is_(None), Test.parent_id.is_(None)),
        )
    )

    if question_type:
        stmt = stmt.where(Question.question_type.in_(question_type))
    if test_id:
        # "bank" is a UI sentinel mixed with real test UUIDs, meaning "include unattached questions"
        bank_requested = "bank" in test_id
        real_ids = [t for t in test_id if t != "bank"]
        if bank_requested and real_ids:
            stmt = stmt.where(sa.or_(Question.test_id.is_(None), Question.test_id.in_(real_ids)))
        elif bank_requested:
            stmt = stmt.where(Question.test_id.is_(None))
        elif real_ids:
            stmt = stmt.where(Question.test_id.in_(real_ids))
    if grouping == "grouped":
        stmt = stmt.where(Question.group_id.is_not(None))
    elif grouping == "ungrouped":
        stmt = stmt.where(Question.group_id.is_(None))
    if search:
        stmt = stmt.where(token_search(Question.prompt, search=search))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(_sort_clause(sort_by, sort_order)).offset((page - 1) * per_page).limit(per_page)
    questions = db.scalars(stmt).all()
    return questions, total


def create_one(db: Session, *, data: QuestionCreateStandalone, user_id: str) -> Question:
    obj = Question(
        user_id=user_id,
        question_type=int(data.question_type),
        prompt=data.prompt,
        content=data.content.model_dump(),
        hint=data.hint,
        explanation=data.explanation,
        points=data.points,
    )
    db.add(obj)
    db.flush()
    return obj


def create_many(
    db: Session,
    *,
    questions: list[QuestionCreate],
    user_id: str,
    test_id: str | None = None,
    group_id: str | None = None,
) -> list[Question]:
    objs = [
        Question(
            user_id=user_id,
            test_id=test_id,
            group_id=group_id,
            question_type=int(q.question_type),
            prompt=q.prompt,
            content=q.content.model_dump(),
            hint=q.hint,
            explanation=q.explanation,
            order=q.order,
        )
        for q in questions
    ]
    db.add_all(objs)
    db.flush()
    return objs


def duplicate_to_bank(db: Session, *, source: Question, user_id: str) -> Question:
    """Copy a question (test-owned or bank) into the user's bank as a new standalone question.

    SRS state is intentionally not copied — the duplicate starts fresh.
    """
    obj = Question(
        user_id=user_id,
        question_type=source.question_type,
        prompt=source.prompt,
        content=copy.deepcopy(source.content),
        hint=source.hint,
        explanation=source.explanation,
        points=source.points,
        origin_id=source.id,
    )
    db.add(obj)
    db.flush()
    return obj


def copy_to_test(db: Session, *, source: Question, user_id: str, test_id: str, order: int) -> Question:
    """Copy a question into a test at the given order. Used by single and bulk assign."""
    obj = Question(
        user_id=user_id,
        question_type=source.question_type,
        prompt=source.prompt,
        content=copy.deepcopy(source.content),
        hint=source.hint,
        explanation=source.explanation,
        test_id=test_id,
        order=order,
        points=source.points,
        origin_id=source.id,
    )
    db.add(obj)
    db.flush()
    return obj


def update(db: Session, *, question: Question, data: QuestionUpdate) -> Question:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    db.flush()
    return question


def has_references(db: Session, *, question_id: str) -> bool:
    """Check if a question has any answer or SRS state rows referencing it."""
    has_answer = db.execute(select(Answer.id).where(Answer.question_id == question_id).limit(1)).first()
    if has_answer:
        return True
    has_srs = db.execute(
        select(UserQuestionState.id).where(UserQuestionState.question_id == question_id).limit(1)
    ).first()
    return has_srs is not None


def soft_delete(db: Session, *, question: Question) -> None:
    question.status = int(QuestionStatus.DELETED)
    db.flush()


def hard_delete(db: Session, *, question: Question) -> None:
    db.delete(question)
    db.flush()


def list_random_for_user(db: Session, *, user_id: str, limit: int) -> Sequence[Question]:
    return db.scalars(_reviewable_base_query(user_id=user_id).order_by(func.random()).limit(limit)).all()


def _reviewable_base_query(*, user_id: str) -> Select[tuple[Question]]:
    # Questions reach their owning test through two paths:
    #   - Standalone: Question.test_id → Test.id
    #   - Grouped:    Question.group_id → TestQuestionGroup.test_id → Test.id
    # We outer-join both and coalesce to cover both cases.
    resolved_test_id = func.coalesce(Question.test_id, TestQuestionGroup.test_id)
    return (
        select(Question)
        .outerjoin(TestQuestionGroup, Question.group_id == TestQuestionGroup.id)
        .join(Test, resolved_test_id == Test.id)
        .where(
            Test.user_id == user_id,
            Test.status == int(TestStatus.ACTIVE),
            Test.parent_id.is_(None),
            Question.status == int(QuestionStatus.ACTIVE),
            Question.question_type.in_([int(QuestionType.SIMPLE), int(QuestionType.MULTIPLE_CHOICE)]),
        )
    )


def list_due_for_review(db: Session, *, user_id: str, limit: int) -> Sequence[Question]:
    now = datetime.now(timezone.utc)
    stmt = (
        _reviewable_base_query(user_id=user_id)
        .join(UserQuestionState, UserQuestionState.question_id == Question.id)
        .where(
            UserQuestionState.user_id == user_id,
            UserQuestionState.next_review <= now,
        )
        .order_by(UserQuestionState.next_review.asc())
        .limit(limit)
    )
    return db.scalars(stmt).all()


def list_new_for_review(db: Session, *, user_id: str, limit: int) -> Sequence[Question]:
    stmt = (
        _reviewable_base_query(user_id=user_id)
        .outerjoin(
            UserQuestionState,
            (UserQuestionState.question_id == Question.id) & (UserQuestionState.user_id == user_id),
        )
        .where(UserQuestionState.id.is_(None))
        .order_by(func.random())
        .limit(limit)
    )
    return db.scalars(stmt).all()


def user_has_questions(db: Session, *, user_id: str) -> bool:
    stmt = _reviewable_base_query(user_id=user_id).limit(1)
    return db.execute(stmt).first() is not None
