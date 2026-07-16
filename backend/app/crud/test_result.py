from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

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
