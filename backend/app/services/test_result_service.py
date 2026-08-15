from sqlalchemy.orm import Session

from app.crud import test_result as test_result_crud
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.test_result import SortOrder, TestResultListItem, TestResultSortBy
from app.services.service_helpers import get_owned_or_404


def get_result(db: Session, *, result_id: str, current_user: User) -> TestResult:
    return get_owned_or_404(
        db, fetch=test_result_crud.get_by_id, id=result_id, current_user=current_user, entity_name="Test result"
    )


def list_results(
    db: Session,
    *,
    current_user: User,
    search: str | None = None,
    sort_by: TestResultSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[TestResultListItem], int]:
    items, total = test_result_crud.list_by_user(
        db,
        user_id=current_user.id,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return [TestResultListItem.model_validate(r) for r in items], total
