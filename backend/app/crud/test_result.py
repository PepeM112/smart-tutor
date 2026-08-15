from collections.abc import Sequence
from typing import cast

from sqlalchemy import UnaryExpression, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session, selectinload

from app.crud.helpers import token_search
from app.models.answer import Answer
from app.models.test import Test
from app.models.test_result import TestResult


def get_by_id(db: Session, *, id: str) -> TestResult | None:
    stmt = (
        select(TestResult)
        .options(selectinload(TestResult.answers), selectinload(TestResult.test))
        .where(TestResult.id == id)
    )
    return db.scalars(stmt).first()


_SORT_COLUMNS: dict[str, InstrumentedAttribute[object]] = {
    "score": TestResult.score,
    "created_at": TestResult.created_at,
}


def _sort_clause(sort_by: str | None, sort_order: str) -> UnaryExpression[object]:
    column = _SORT_COLUMNS[sort_by] if sort_by and sort_by in _SORT_COLUMNS else TestResult.created_at
    clause = column.asc() if sort_order == "asc" else column.desc()
    return cast(UnaryExpression[object], clause)


def list_by_user(
    db: Session,
    *,
    user_id: str,
    search: str | None = None,
    sort_by: str | None = None,
    sort_order: str = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[Sequence[TestResult], int]:
    stmt = (
        select(TestResult)
        .join(Test, TestResult.test_id == Test.id)
        .options(selectinload(TestResult.test))
        .where(TestResult.user_id == user_id)
    )

    if search:
        stmt = stmt.where(token_search(Test.title, search=search))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(_sort_clause(sort_by, sort_order)).offset((page - 1) * per_page).limit(per_page)
    results = db.scalars(stmt).all()
    return results, total


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
) -> TestResult:
    test_result = TestResult(
        test_id=test_id,
        user_id=user_id,
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
