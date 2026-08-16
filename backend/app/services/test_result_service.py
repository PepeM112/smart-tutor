from sqlalchemy.orm import Session

from app.crud import test_result as test_result_crud
from app.models.test_result import TestResult
from app.models.user import User
from app.services.service_helpers import get_owned_or_404


def get_result(db: Session, *, result_id: str, current_user: User) -> TestResult:
    return get_owned_or_404(  # type: ignore[return-value]
        db, fetch=test_result_crud.get_by_id, id=result_id, current_user=current_user, entity_name="Test result"
    )


def list_results(db: Session, *, current_user: User) -> list[TestResult]:
    return test_result_crud.list_by_user(db, user_id=current_user.id)
