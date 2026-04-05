from typing import List, Optional

from sqlalchemy.orm import Session, selectinload

from app.models.test_result import TestResult


def get_by_id(db: Session, *, id: str) -> Optional[TestResult]:
    return (
        db.query(TestResult)
        .options(selectinload(TestResult.answers), selectinload(TestResult.test))
        .filter(TestResult.id == id)
        .first()
    )


def list_by_user(db: Session, *, user_id: str) -> List[TestResult]:
    return (
        db.query(TestResult)
        .options(selectinload(TestResult.test))
        .filter(TestResult.user_id == user_id)
        .order_by(TestResult.created_at.desc())
        .all()
    )
