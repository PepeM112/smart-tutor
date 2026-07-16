from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.answer import Answer
from app.models.test_result import TestResult


def get_by_id(db: Session, *, id: str) -> Answer | None:
    return db.execute(select(Answer).where(Answer.id == id)).scalar_one_or_none()


def get_by_id_with_test_result(db: Session, *, id: str) -> Answer | None:
    return (
        db.execute(select(Answer).options(joinedload(Answer.test_result)).where(Answer.id == id))
        .unique()
        .scalar_one_or_none()
    )


def get_test_result_with_answers(db: Session, *, test_result_id: str) -> TestResult | None:
    return (
        db.execute(
            select(TestResult).options(joinedload(TestResult.answers)).where(TestResult.id == test_result_id)
        )
        .unique()
        .scalar_one_or_none()
    )
