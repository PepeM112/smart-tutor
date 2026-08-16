from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import QuestionStatus, TestStatus
from app.models.question import Question
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.schemas.test import TestUpdate


def _active_load_options() -> list[selectinload]:  # type: ignore[type-arg]
    """Eager-load only active (non-deleted) questions and groups."""
    active_q = int(QuestionStatus.ACTIVE)
    return [
        selectinload(Test.questions.and_(Question.status == active_q)),
        selectinload(Test.question_groups.and_(TestQuestionGroup.status == active_q)).selectinload(
            TestQuestionGroup.questions.and_(Question.status == active_q)
        ),
    ]


def get_by_id(db: Session, *, id: str) -> Test | None:
    stmt = select(Test).options(*_active_load_options()).where(Test.id == id, Test.status == TestStatus.ACTIVE)
    return db.scalars(stmt).first()


def list_by_user(db: Session, *, user_id: str) -> list[Test]:
    stmt = (
        select(Test)
        .options(*_active_load_options())
        .where(Test.user_id == user_id, Test.status == TestStatus.ACTIVE, Test.parent_id.is_(None))
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
    db.flush()
    return test


def delete(db: Session, *, test: Test) -> None:
    test.status = TestStatus.DELETED
    db.flush()
