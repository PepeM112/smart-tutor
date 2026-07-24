from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import TestStatus
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.schemas.test import TestUpdate


def get_by_id(db: Session, *, id: str) -> Test | None:
    stmt = (
        select(Test)
        .options(
            selectinload(Test.questions),
            selectinload(Test.question_groups).selectinload(TestQuestionGroup.questions),
        )
        .where(Test.id == id, Test.status == TestStatus.ACTIVE)
    )
    return db.scalars(stmt).first()


def list_by_user(db: Session, *, user_id: str) -> list[Test]:
    stmt = (
        select(Test)
        .options(
            selectinload(Test.questions),
            selectinload(Test.question_groups).selectinload(TestQuestionGroup.questions),
        )
        .where(Test.user_id == user_id, Test.status == TestStatus.ACTIVE)
    )
    return list(db.scalars(stmt).all())


def create(
    db: Session, *, user_id: str, title: str, description: str | None, source_note_id: str | None = None
) -> Test:
    test = Test(user_id=user_id, title=title, description=description, source_note_id=source_note_id)
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
    test.status = TestStatus.DELETED
    db.commit()
