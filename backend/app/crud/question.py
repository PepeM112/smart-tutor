import copy
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import cast

import sqlalchemy as sa
from sqlalchemy import ColumnElement, Select, UnaryExpression, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session, aliased, contains_eager, joinedload, selectinload

from app.core.enums import MemberStatus, QuestionStatus, QuestionType, RevealAnswers, TestStatus
from app.crud.helpers import token_search
from app.crud.space import editor_space_ids
from app.crud.space_item import visible_course_ids
from app.models.answer import Answer
from app.models.question import Question
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_item_completion import SpaceItemCompletion
from app.models.space_item_test import SpaceItemTest
from app.models.space_member import SpaceMember
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

# Review scopes. Any other value is the id of one course.
REVIEW_SCOPE_ALL = "all"
REVIEW_SCOPE_PERSONAL = "personal"


def get_by_id(db: Session, *, id: str, active_only: bool = False) -> Question | None:
    """Fetch one question. Deleted ones are included, because old answers can still point to them.

    Pass `active_only=True` to treat a deleted question as missing.
    """
    stmt = select(Question).options(joinedload(Question.question_group)).where(Question.id == id)
    if active_only:
        stmt = stmt.where(Question.status == int(QuestionStatus.ACTIVE))
    return db.execute(stmt).scalar_one_or_none()


def list_by_ids(db: Session, *, ids: list[str], active_only: bool = True) -> Sequence[Question]:
    """Fetch questions by id, unordered. Used by bulk operations to resolve ownership.

    Only active questions by default. Restore passes `active_only=False` because it needs the deleted rows.
    """
    # Eager-load both paths to the owning test: bulk actions call `question_space_id` on each row.
    stmt = (
        select(Question)
        .options(
            joinedload(Question.test),
            joinedload(Question.question_group).joinedload(TestQuestionGroup.test),
        )
        .where(Question.id.in_(ids))
    )
    if active_only:
        stmt = stmt.where(Question.status == int(QuestionStatus.ACTIVE))
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
    # A question reaches its test directly (standalone, `test_id`) or through its group (grouped questions
    # keep `test_id = NULL`). The aliased join is for filtering only: `Question.test` must stay the direct
    # relationship, so the titles are loaded with `selectinload` (see `Question.owning_test`).
    owning_test = aliased(Test)
    resolved_test_id = func.coalesce(Question.test_id, TestQuestionGroup.test_id)
    is_bank = sa.and_(Question.test_id.is_(None), Question.group_id.is_(None))
    stmt = (
        select(Question)
        .outerjoin(TestQuestionGroup, Question.group_id == TestQuestionGroup.id)
        .outerjoin(owning_test, resolved_test_id == owning_test.id)
        .options(
            selectinload(Question.test),
            contains_eager(Question.question_group).selectinload(TestQuestionGroup.test),
        )
        .where(
            Question.user_id == user_id,
            Question.status == int(QuestionStatus.ACTIVE),
            # Bank questions, or questions of a live personal test: no frozen version snapshot
            # (parent_id set), no deleted test and no course / classroom test (space_id set).
            sa.or_(
                is_bank,
                sa.and_(
                    owning_test.parent_id.is_(None),
                    owning_test.status == int(TestStatus.ACTIVE),
                    owning_test.space_id.is_(None),
                ),
            ),
        )
    )

    if question_type:
        stmt = stmt.where(Question.question_type.in_(question_type))
    if test_id:
        # "bank" is a UI sentinel mixed with real test UUIDs, meaning "include unattached questions"
        bank_requested = "bank" in test_id
        real_ids = [t for t in test_id if t != "bank"]
        if bank_requested and real_ids:
            stmt = stmt.where(sa.or_(is_bank, resolved_test_id.in_(real_ids)))
        elif bank_requested:
            stmt = stmt.where(is_bank)
        elif real_ids:
            stmt = stmt.where(resolved_test_id.in_(real_ids))
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
            points=q.points,
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


def bulk_restore(db: Session, *, questions: Sequence[Question]) -> None:
    for q in questions:
        q.status = int(QuestionStatus.ACTIVE)
    db.flush()


def list_random_for_user(db: Session, *, user_id: str, limit: int, scope: str = REVIEW_SCOPE_ALL) -> Sequence[Question]:
    return db.scalars(_reviewable_base_query(user_id=user_id, scope=scope).order_by(func.random()).limit(limit)).all()


def _reviewable_test_filter(*, user_id: str, scope: str) -> ColumnElement[bool]:
    """Which tests feed Review (`scope`: "all", "personal", or the id of one course).

    - Personal tests of the user.
    - Course tests of the courses where the user is an ACTIVE member with `include_in_srs` on: published
      only (never a draft), and linked to a published item whose answer key the user may see: ALWAYS, or
      AFTER_PASS_OR_LAST once the user has a completion row for that item. NEVER items are never in.
    - Items with a future `visible_from`, and classroom courses students can not see yet, are out
      (unless the user is an editor there).
    """
    personal = sa.and_(Test.user_id == user_id, Test.space_id.is_(None))
    opted_in_spaces = select(SpaceMember.space_id).where(
        SpaceMember.user_id == user_id,
        SpaceMember.status == int(MemberStatus.ACTIVE),
        SpaceMember.include_in_srs.is_(True),
    )
    passed_by_user = (
        select(SpaceItemCompletion.item_id)
        .where(SpaceItemCompletion.item_id == SpaceItem.id, SpaceItemCompletion.user_id == user_id)
        .exists()
    )
    reviewable_item = (
        select(SpaceItemTest.test_id)
        .join(SpaceItem, SpaceItem.id == SpaceItemTest.item_id)
        .where(
            SpaceItemTest.test_id == Test.id,
            SpaceItem.is_draft.is_(False),
            sa.or_(SpaceItem.visible_from.is_(None), SpaceItem.visible_from <= func.now()),
            sa.or_(
                SpaceItem.reveal_answers == int(RevealAnswers.ALWAYS),
                sa.and_(SpaceItem.reveal_answers == int(RevealAnswers.AFTER_PASS_OR_LAST), passed_by_user),
            ),
        )
    )
    hidden_courses = select(Space.id).where(Space.parent_id.is_not(None), Space.id.not_in(visible_course_ids()))
    course = sa.and_(
        Test.space_id.in_(opted_in_spaces),
        sa.or_(Test.space_id.not_in(hidden_courses), Test.space_id.in_(editor_space_ids(user_id=user_id))),
        Test.is_draft.is_(False),
        reviewable_item.exists(),
    )
    if scope == REVIEW_SCOPE_PERSONAL:
        return personal
    if scope == REVIEW_SCOPE_ALL:
        return sa.or_(personal, course)
    return sa.and_(course, Test.space_id == scope)


def _reviewable_base_query(*, user_id: str, scope: str = REVIEW_SCOPE_ALL) -> Select[tuple[Question]]:
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
            _reviewable_test_filter(user_id=user_id, scope=scope),
            Test.status == int(TestStatus.ACTIVE),
            Test.parent_id.is_(None),
            Question.status == int(QuestionStatus.ACTIVE),
            Question.question_type.in_([int(QuestionType.SIMPLE), int(QuestionType.MULTIPLE_CHOICE)]),
        )
    )


def is_reviewable(db: Session, *, question_id: str, user_id: str) -> bool:
    """Is the question in the Review pool of the user (scope "all")? Used to check a course question."""
    stmt = _reviewable_base_query(user_id=user_id).where(Question.id == question_id).limit(1)
    return db.execute(stmt).first() is not None


def list_due_for_review(db: Session, *, user_id: str, limit: int, scope: str = REVIEW_SCOPE_ALL) -> Sequence[Question]:
    now = datetime.now(timezone.utc)
    stmt = (
        _reviewable_base_query(user_id=user_id, scope=scope)
        .join(UserQuestionState, UserQuestionState.question_id == Question.id)
        .where(
            UserQuestionState.user_id == user_id,
            UserQuestionState.next_review <= now,
        )
        .order_by(UserQuestionState.next_review.asc())
        .limit(limit)
    )
    return db.scalars(stmt).all()


def list_new_for_review(db: Session, *, user_id: str, limit: int, scope: str = REVIEW_SCOPE_ALL) -> Sequence[Question]:
    stmt = (
        _reviewable_base_query(user_id=user_id, scope=scope)
        .outerjoin(
            UserQuestionState,
            (UserQuestionState.question_id == Question.id) & (UserQuestionState.user_id == user_id),
        )
        .where(UserQuestionState.id.is_(None))
        .order_by(func.random())
        .limit(limit)
    )
    return db.scalars(stmt).all()


def user_has_questions(db: Session, *, user_id: str, scope: str = REVIEW_SCOPE_ALL) -> bool:
    stmt = _reviewable_base_query(user_id=user_id, scope=scope).limit(1)
    return db.execute(stmt).first() is not None
