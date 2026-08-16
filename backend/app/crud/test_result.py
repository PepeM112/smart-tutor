from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.answer import Answer
from app.models.test_result import TestResult


def get_by_id(db: Session, *, id: str) -> TestResult | None:
    stmt = (
        select(TestResult)
        .options(selectinload(TestResult.answers), selectinload(TestResult.test))
        .where(TestResult.id == id)
    )
    return db.scalars(stmt).first()


def list_by_user(db: Session, *, user_id: str) -> list[TestResult]:
    stmt = (
        select(TestResult)
        .options(selectinload(TestResult.test))
        .where(TestResult.user_id == user_id)
        .order_by(TestResult.created_at.desc())
    )
    return list(db.scalars(stmt).all())


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
