from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.crud import test_result as test_result_crud
from app.models.test_result import TestResult
from app.models.user import User


def get_result(db: Session, *, result_id: str, current_user: User) -> TestResult:
    result = test_result_crud.get_by_id(db, id=result_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test result not found")
    if result.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return result


def list_results(db: Session, *, current_user: User) -> list[TestResult]:
    return test_result_crud.list_by_user(db, user_id=current_user.id)
