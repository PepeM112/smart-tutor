from typing import Annotated, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.test_result import TestResultListItem, TestResultRead
from app.services import test_result_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=List[TestResultListItem])
def list(db: DbSession, current_user: CurrentUser) -> List[TestResult]:
    return test_result_service.list_results(db, current_user=current_user)


@router.get("/{result_id}", response_model=TestResultRead)
def get(result_id: str, db: DbSession, current_user: CurrentUser) -> TestResult:
    return test_result_service.get_result(db, result_id=result_id, current_user=current_user)
