from collections.abc import Sequence
from datetime import datetime
from typing import cast

import sqlalchemy as sa
from sqlalchemy import UnaryExpression, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session, contains_eager, selectinload

from app.crud.helpers import token_search
from app.models.answer import Answer
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.test import Test
from app.models.test_result import TestResult
from app.schemas.test_result import SortOrder, TestResultSortBy


def get_by_id(db: Session, *, id: str) -> TestResult | None:
    stmt = (
        select(TestResult)
        .options(selectinload(TestResult.answers), selectinload(TestResult.test))
        .where(TestResult.id == id)
    )
    return db.scalars(stmt).first()


def lock(db: Session, *, id: str) -> None:
    """Row lock on the result until the transaction ends. Two score changes of one result then run one by one."""
    db.execute(select(TestResult.id).where(TestResult.id == id).with_for_update())


def lock_for_grading(db: Session, *, id: str) -> None:
    """Wait until no other grader works on this result, then keep an advisory lock until the transaction ends.

    The row lock of `lock` can not do this: the grader must not hold it during the (long) AI calls,
    or a teacher override would wait for them. The advisory lock is a separate key that only graders take.
    """
    db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(f"grade:{id}", 0))))


_SORT_COLUMNS: dict[str, InstrumentedAttribute[object]] = {
    "score": TestResult.score,
    "created_at": TestResult.created_at,
}


def _sort_clause(sort_by: TestResultSortBy | None, sort_order: SortOrder) -> UnaryExpression[object]:
    column = _SORT_COLUMNS[sort_by] if sort_by and sort_by in _SORT_COLUMNS else TestResult.created_at
    clause = column.asc() if sort_order == "asc" else column.desc()
    return cast(UnaryExpression[object], clause)


def list_by_user(
    db: Session,
    *,
    user_id: str,
    search: str | None = None,
    score_min: float | None = None,
    score_max: float | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort_by: TestResultSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[Sequence[tuple[TestResult, str | None]], int]:
    """The results of the user, newest first by default. Each row has the title of its course, or None
    for a personal result. A frozen version keeps the `space_id` of its test, so old attempts keep the label.
    """
    stmt = (
        select(TestResult, Space.title)
        .join(Test, TestResult.test_id == Test.id)
        .outerjoin(Space, Test.space_id == Space.id)
        .options(contains_eager(TestResult.test))
        .where(TestResult.user_id == user_id)
    )

    if search:
        stmt = stmt.where(token_search(Test.title, search=search))
    if score_min is not None:
        stmt = stmt.where(TestResult.score >= score_min)
    if score_max is not None:
        stmt = stmt.where(TestResult.score <= score_max)
    if created_from:
        stmt = stmt.where(TestResult.created_at >= created_from)
    if created_to:
        stmt = stmt.where(TestResult.created_at <= created_to)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(_sort_clause(sort_by, sort_order)).offset((page - 1) * per_page).limit(per_page)
    rows = db.execute(stmt).tuples().all()
    return rows, total


def create(
    db: Session,
    *,
    test_id: str,
    user_id: str,
    score: float,
    total_questions: int,
    correct_answers: int,
    pending_answers: int,
    earned_points: float,
    total_points: float,
    answers: list[Answer],
    space_item_id: str | None = None,
) -> TestResult:
    test_result = TestResult(
        test_id=test_id,
        user_id=user_id,
        space_item_id=space_item_id,
        score=score,
        total_questions=total_questions,
        correct_answers=correct_answers,
        pending_answers=pending_answers,
        earned_points=earned_points,
        total_points=total_points,
        answers=answers,
    )
    db.add(test_result)
    db.flush()
    return test_result


def best_scores_by_item(db: Session, *, user_id: str, item_ids: Sequence[str]) -> dict[str, float]:
    """`{space item id: best score (0..100)}` of the user. Results with an answer still being graded are skipped.

    Only results created after the item's `progress_reset_at` count (all results when it is NULL).
    """
    if not item_ids:
        return {}
    stmt = (
        select(TestResult.space_item_id, func.max(TestResult.score))
        .join(SpaceItem, SpaceItem.id == TestResult.space_item_id)
        .where(
            TestResult.user_id == user_id,
            TestResult.space_item_id.in_(item_ids),
            TestResult.pending_answers == 0,
            sa.or_(SpaceItem.progress_reset_at.is_(None), TestResult.created_at > SpaceItem.progress_reset_at),
        )
        .group_by(TestResult.space_item_id)
    )
    return {item_id: score for item_id, score in db.execute(stmt).all() if item_id is not None}


def _in_progress_window() -> sa.ColumnElement[bool]:
    """The result is after the `progress_reset_at` of its item (or the item was never reset)."""
    return sa.or_(SpaceItem.progress_reset_at.is_(None), TestResult.created_at > SpaceItem.progress_reset_at)


def best_results_by_user_item(
    db: Session, *, user_ids: Sequence[str], item_ids: Sequence[str]
) -> dict[tuple[str, str], tuple[str, float]]:
    """`{(user id, item id): (result id, score)}`: the best graded result of each pair, with one query.

    Same rules as `best_scores_by_item`: a result with an answer in grading is skipped, and the reset window
    applies. On a tie the older result wins, so the result id is stable.
    """
    if not user_ids or not item_ids:
        return {}
    stmt = (
        select(TestResult.user_id, TestResult.space_item_id, TestResult.id, TestResult.score)
        .join(SpaceItem, SpaceItem.id == TestResult.space_item_id)
        .where(
            TestResult.user_id.in_(user_ids),
            TestResult.space_item_id.in_(item_ids),
            TestResult.pending_answers == 0,
            _in_progress_window(),
        )
        .distinct(TestResult.user_id, TestResult.space_item_id)
        .order_by(
            TestResult.user_id, TestResult.space_item_id, TestResult.score.desc(), TestResult.created_at, TestResult.id
        )
    )
    return {(user_id, item_id): (result_id, score) for user_id, item_id, result_id, score in db.execute(stmt).all()}


def pending_pairs(db: Session, *, user_ids: Sequence[str], item_ids: Sequence[str]) -> set[tuple[str, str]]:
    """`{(user id, item id)}` that have a result with an answer still in grading (in the reset window)."""
    if not user_ids or not item_ids:
        return set()
    stmt = (
        select(TestResult.user_id, TestResult.space_item_id)
        .join(SpaceItem, SpaceItem.id == TestResult.space_item_id)
        .where(
            TestResult.user_id.in_(user_ids),
            TestResult.space_item_id.in_(item_ids),
            TestResult.pending_answers > 0,
            _in_progress_window(),
        )
        .distinct()
    )
    return {(user_id, item_id) for user_id, item_id in db.execute(stmt).all() if item_id is not None}


def overridden_pairs(db: Session, *, user_ids: Sequence[str], item_ids: Sequence[str]) -> set[tuple[str, str]]:
    """`{(user id, item id)}` that have a result with a teacher-graded answer (in the reset window)."""
    if not user_ids or not item_ids:
        return set()
    stmt = (
        select(TestResult.user_id, TestResult.space_item_id)
        .join(Answer, Answer.test_result_id == TestResult.id)
        .join(SpaceItem, SpaceItem.id == TestResult.space_item_id)
        .where(
            TestResult.user_id.in_(user_ids),
            TestResult.space_item_id.in_(item_ids),
            Answer.override_score.is_not(None),
            _in_progress_window(),
        )
        .distinct()
    )
    return {(user_id, item_id) for user_id, item_id in db.execute(stmt).all() if item_id is not None}
