from typing import List

from sqlalchemy.orm import Session

from app.crud import test_result as test_result_crud
from app.models.test_result import TestResult
from app.models.user import User


def list_results(db: Session, *, current_user: User) -> List[TestResult]:
    return test_result_crud.list_by_user(db, user_id=current_user.id)
