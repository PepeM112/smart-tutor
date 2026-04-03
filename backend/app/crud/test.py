from typing import List, Optional

from sqlalchemy.orm import Session, selectinload

from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.schemas.test import TestUpdate


def get_by_id(db: Session, *, id: str) -> Optional[Test]:
    return (
        db.query(Test)
        .options(
            selectinload(Test.questions),
            selectinload(Test.question_groups).selectinload(TestQuestionGroup.questions),
        )
        .filter(Test.id == id)
        .first()
    )


def list_by_user(db: Session, *, user_id: str) -> List[Test]:
    return (
        db.query(Test)
        .options(
            selectinload(Test.questions),
            selectinload(Test.question_groups).selectinload(TestQuestionGroup.questions),
        )
        .filter(Test.user_id == user_id)
        .all()
    )


def create(db: Session, *, user_id: str, title: str, description: Optional[str]) -> Test:
    test = Test(user_id=user_id, title=title, description=description)
    db.add(test)
    db.flush()
    return test


def update(db: Session, *, test: Test, data: TestUpdate) -> Test:
    for field, value in data.model_dump(exclude_unset=True, exclude={"questions", "question_groups"}).items():
        setattr(test, field, value)
    db.commit()
    db.refresh(test)
    return test


def delete(db: Session, *, test: Test) -> None:
    db.delete(test)
    db.commit()
