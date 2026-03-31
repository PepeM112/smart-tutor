from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.crud import question as question_crud
from app.crud import test as test_crud
from app.models.test import Test
from app.models.user import User
from app.schemas.test import TestCreate, TestUpdate


def _get_owned_test_or_404(db: Session, *, test_id: UUID, current_user: User) -> Test:
    test = test_crud.get_by_id(db, id=test_id)
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    if test.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return test


def list_tests(db: Session, *, current_user: User) -> List[Test]:
    return test_crud.list_by_user(db, user_id=current_user.id)


def get_test(db: Session, *, test_id: UUID, current_user: User) -> Test:
    return _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)


def create_test(db: Session, *, current_user: User, data: TestCreate) -> Test:
    test = test_crud.create(db, user_id=current_user.id, title=data.title, description=data.description)
    if data.questions:
        question_crud.create_many(db, test_id=test.id, questions=data.questions)
    # Re-fetch so the questions relationship is eagerly loaded via selectinload
    reloaded = test_crud.get_by_id(db, id=test.id)
    assert reloaded is not None  # just created — cannot be None
    return reloaded


def update_test(db: Session, *, test_id: UUID, current_user: User, data: TestUpdate) -> Test:
    test = _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)
    if data.questions:
        question_crud.create_many(db, test_id=test.id, questions=data.questions)
    updated = test_crud.update(db, test=test, data=data)
    # Re-fetch so the questions relationship reflects any newly added questions
    reloaded = test_crud.get_by_id(db, id=updated.id)
    assert reloaded is not None
    return reloaded


def delete_test(db: Session, *, test_id: UUID, current_user: User) -> None:
    test = _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)
    test_crud.delete(db, test=test)
