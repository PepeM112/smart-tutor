from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.crud import question as question_crud
from app.crud import test as test_crud
from app.crud import test_question_group as group_crud
from app.models.test import Test
from app.models.user import User
from app.schemas.question import QuestionCreate
from app.schemas.test import TestCreate, TestUpdate
from app.schemas.test_question_group import TestQuestionGroupCreate


def _get_owned_test_or_404(db: Session, *, test_id: str, current_user: User) -> Test:
    test = test_crud.get_by_id(db, id=test_id)
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    if test.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return test


def _validate_order_space(
    questions: list[QuestionCreate],
    groups: list[TestQuestionGroupCreate],
    existing_orders: set[int],
) -> None:
    """
    Validate that standalone questions and question groups don't collide in
    the shared order space within a test.

    Checks both the incoming payload for internal duplicates AND against
    orders already persisted in the database (relevant for updates).
    """
    incoming_orders: list[int] = []
    for q in questions:
        incoming_orders.append(q.order)
    for g in groups:
        incoming_orders.append(g.order)

    # Check incoming payload has no internal duplicates
    if len(incoming_orders) != len(set(incoming_orders)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate order values: standalone questions and question groups share the same order space",
        )

    # Check incoming orders don't collide with existing ones
    collisions = set(incoming_orders) & existing_orders
    if collisions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order values already taken in this test: {sorted(collisions)}",
        )


def _get_existing_orders(test: Test) -> set[int]:
    """Collect all order values currently used in a test (questions + groups)."""
    orders: set[int] = set()
    for q in test.questions:
        orders.add(q.order)
    for g in test.question_groups:
        orders.add(g.order)
    return orders


def list_tests(db: Session, *, current_user: User) -> list[Test]:
    return test_crud.list_by_user(db, user_id=current_user.id)


def get_test(db: Session, *, test_id: str, current_user: User) -> Test:
    return _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)


def create_test(db: Session, *, current_user: User, data: TestCreate) -> Test:
    # On create there are no existing orders — only check for internal duplicates
    _validate_order_space(data.questions, data.question_groups, existing_orders=set())

    test = test_crud.create(db, user_id=current_user.id, title=data.title, description=data.description)

    if data.questions:
        question_crud.create_many(db, questions=data.questions, test_id=test.id)

    if data.question_groups:
        group_crud.create_many(db, test_id=test.id, groups=data.question_groups)

    db.commit()

    # Re-fetch with eager loading
    reloaded = test_crud.get_by_id(db, id=test.id)
    assert reloaded is not None  # just created — cannot be None
    return reloaded


def update_test(db: Session, *, test_id: str, current_user: User, data: TestUpdate) -> Test:
    test = _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)

    # Check incoming orders against what's already in the test
    _validate_order_space(data.questions, data.question_groups, existing_orders=_get_existing_orders(test))

    if data.questions:
        question_crud.create_many(db, questions=data.questions, test_id=test.id)

    if data.question_groups:
        group_crud.create_many(db, test_id=test.id, groups=data.question_groups)

    updated = test_crud.update(db, test=test, data=data)

    # Re-fetch with eager loading
    reloaded = test_crud.get_by_id(db, id=updated.id)
    assert reloaded is not None
    return reloaded


def delete_test(db: Session, *, test_id: str, current_user: User) -> None:
    test = _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)
    test_crud.delete(db, test=test)
