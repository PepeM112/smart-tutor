from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import GroupStatus, QuestionStatus
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.crud import test_question_group as group_crud
from app.models.test import Test
from app.models.user import User
from app.schemas.question import QuestionCreate
from app.schemas.test import SortOrder, TestCreate, TestRead, TestSortBy, TestUpdate
from app.schemas.test_question_group import TestQuestionGroupCreate
from app.services.service_helpers import get_owned_or_404
from app.services.versioning_service import version_test_if_needed


def get_test(db: Session, *, test_id: str, current_user: User) -> Test:
    return get_owned_or_404(db, fetch=test_crud.get_by_id, id=test_id, current_user=current_user, entity_name="Test")


def _validate_order_space(
    questions: list[QuestionCreate],
    groups: list[TestQuestionGroupCreate],
) -> None:
    """
    Validate that standalone questions and question groups don't have
    duplicate order values within the incoming payload.
    """
    incoming_orders: list[int] = []
    for q in questions:
        incoming_orders.append(q.order)
    for g in groups:
        incoming_orders.append(g.order)

    if len(incoming_orders) != len(set(incoming_orders)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate order values: standalone questions and question groups share the same order space",
        )


def list_tests(
    db: Session,
    *,
    current_user: User,
    search: str | None = None,
    question_type: list[int] | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort_by: TestSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[TestRead], int]:
    items, total = test_crud.list_by_user(
        db,
        user_id=current_user.id,
        search=search,
        question_type=question_type,
        created_from=created_from,
        created_to=created_to,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return [TestRead.model_validate(t) for t in items], total


def create_test(db: Session, *, current_user: User, data: TestCreate) -> Test:
    # On create there are no existing orders — only check for internal duplicates
    _validate_order_space(data.questions, data.question_groups)

    test = test_crud.create(
        db,
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        source_note_id=data.source_note_id,
    )

    if data.questions:
        question_crud.create_many(db, questions=data.questions, user_id=current_user.id, test_id=test.id)

    if data.question_groups:
        group_crud.create_many(db, test_id=test.id, user_id=current_user.id, groups=data.question_groups)

    db.commit()

    # Re-fetch with eager loading
    reloaded = test_crud.get_by_id(db, id=test.id)
    assert reloaded is not None  # just created — cannot be None
    return reloaded


def update_test(db: Session, *, test_id: str, current_user: User, data: TestUpdate) -> Test:
    test = get_test(db, test_id=test_id, current_user=current_user)
    version_test_if_needed(db, test=test)

    _validate_order_space(data.questions or [], data.question_groups or [])

    # Soft-delete existing questions and groups before replacing
    for q in test.questions:
        q.status = int(QuestionStatus.DELETED)
    for g in test.question_groups:
        g.status = int(GroupStatus.DELETED)
        for gq in g.questions:
            gq.status = int(QuestionStatus.DELETED)
    db.flush()

    if data.questions:
        question_crud.create_many(db, questions=data.questions, user_id=current_user.id, test_id=test.id)

    if data.question_groups:
        group_crud.create_many(db, test_id=test.id, user_id=current_user.id, groups=data.question_groups)

    updated = test_crud.update(db, test=test, data=data)
    db.commit()

    # Re-fetch with eager loading
    reloaded = test_crud.get_by_id(db, id=updated.id)
    assert reloaded is not None
    return reloaded


def delete_test(db: Session, *, test_id: str, current_user: User) -> None:
    test = get_test(db, test_id=test_id, current_user=current_user)
    version_test_if_needed(db, test=test)
    test_crud.delete(db, test=test)
    db.commit()
