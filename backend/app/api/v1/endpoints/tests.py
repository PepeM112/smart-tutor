from typing import Annotated, List, Union

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.test import Test
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.test import TestCreate, TestRead, TestReadStripped, TestUpdate
from app.schemas.test_result import TestResultRead
from app.services import correction_service, test_service
from app.services.question_helpers import build_stripped_test

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=List[TestRead])
def list(db: DbSession, current_user: CurrentUser) -> List[Test]:
    return test_service.list_tests(db, current_user=current_user)


@router.get("/{test_id}", response_model=Union[TestReadStripped, TestRead])
def get(
    test_id: str,
    db: DbSession,
    current_user: CurrentUser,
    strip_answers: bool = Query(default=False),
) -> Union[TestReadStripped, TestRead, Test]:
    test = test_service.get_test(db, test_id=test_id, current_user=current_user)
    if strip_answers:
        return build_stripped_test(test)
    return test


@router.post("", response_model=TestRead, status_code=status.HTTP_201_CREATED)
def create(data: TestCreate, db: DbSession, current_user: CurrentUser) -> Test:
    return test_service.create_test(db, current_user=current_user, data=data)


@router.put("/{test_id}", response_model=TestRead)
def update(test_id: str, data: TestUpdate, db: DbSession, current_user: CurrentUser) -> Test:
    return test_service.update_test(db, test_id=test_id, current_user=current_user, data=data)


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(test_id: str, db: DbSession, current_user: CurrentUser) -> None:
    test_service.delete_test(db, test_id=test_id, current_user=current_user)


@router.post("/{test_id}/submit", response_model=TestResultRead, status_code=status.HTTP_201_CREATED)
def submit(test_id: str, data: TestSubmission, db: DbSession, current_user: CurrentUser) -> TestResult:
    return correction_service.correct_test(db, test_id=test_id, current_user=current_user, submission=data)
