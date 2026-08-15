from collections.abc import Sequence
from typing import cast

from sqlalchemy import UnaryExpression, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session, selectinload

from app.core.enums import QuestionStatus, TestStatus
from app.crud.helpers import token_search
from app.models.question import Question
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.schemas.test import SortOrder, TestSortBy, TestUpdate


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


_SORT_COLUMNS: dict[str, InstrumentedAttribute[object]] = {
    "title": Test.title,
    "created_at": Test.created_at,
}


def _sort_clause(sort_by: TestSortBy | None, sort_order: SortOrder) -> UnaryExpression[object]:
    column = _SORT_COLUMNS[sort_by] if sort_by and sort_by in _SORT_COLUMNS else Test.id
    clause = column.asc() if sort_order == "asc" else column.desc()
    # Columns have different underlying Python types (str/datetime); erase to `object`
    # since the clause is only ever passed straight into `order_by()`.
    return cast(UnaryExpression[object], clause)


def list_by_user(
    db: Session,
    *,
    user_id: str,
    search: str | None = None,
    sort_by: TestSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[Sequence[Test], int]:
    stmt = (
        select(Test)
        .options(*_active_load_options())
        .where(Test.user_id == user_id, Test.status == TestStatus.ACTIVE, Test.parent_id.is_(None))
    )

    if search:
        stmt = stmt.where(token_search(Test.title, Test.description, search=search))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(_sort_clause(sort_by, sort_order)).offset((page - 1) * per_page).limit(per_page)
    tests = db.scalars(stmt).all()
    return tests, total


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
