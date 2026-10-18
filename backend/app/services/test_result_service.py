from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.crud import space_item as space_item_crud
from app.crud import test as test_crud
from app.crud import test_result as test_result_crud
from app.models.test import Test
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.answer import AnswerRead
from app.schemas.test import TestRead, TestReadStripped
from app.schemas.test_result import SortOrder, TestResultListItem, TestResultRead, TestResultSortBy
from app.services import space_progress_service
from app.services.access_service import EDIT_ROLES, get_space_access
from app.services.question_helpers import build_stripped_test, without_explanations
from app.services.service_helpers import get_owned_or_404


def get_result(db: Session, *, result_id: str, current_user: User) -> TestResult:
    return get_owned_or_404(
        db, fetch=test_result_crud.get_by_id, id=result_id, current_user=current_user, entity_name="Test result"
    )


def _answers_hidden(db: Session, *, result: TestResult, test: Test, current_user: User) -> bool:
    """True for a VIEWER of a course test whose item does not reveal the answers (or is gone).

    Personal results and authors of the course always see the answers.
    """
    if test.space_id is None:
        return False
    access = get_space_access(db, space_id=test.space_id, user_id=current_user.id)
    if access.role in EDIT_ROLES:
        return False
    item = space_item_crud.get(db, item_id=result.space_item_id) if result.space_item_id else None
    return item is None or not space_progress_service.answers_revealed(db, item=item, user_id=current_user.id)


def _get_result_and_test(db: Session, *, result_id: str, current_user: User) -> tuple[TestResult, Test]:
    result = get_result(db, result_id=result_id, current_user=current_user)
    test = test_crud.get_by_id(db, id=result.test_id)
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return result, test


def get_result_read(db: Session, *, result_id: str, current_user: User) -> TestResultRead:
    """The result with its answers. When the answers are hidden, the rubric criteria (`point`) are
    removed from the Long Text grades: a criterion is part of the answer key. The AI reason stays."""
    result, test = _get_result_and_test(db, result_id=result_id, current_user=current_user)
    read = TestResultRead.model_validate(result)
    if not _answers_hidden(db, result=result, test=test, current_user=current_user):
        return read

    def clean(answer: AnswerRead) -> AnswerRead:
        if not answer.rubric_result:
            return answer
        return answer.model_copy(
            update={"rubric_result": [item.model_copy(update={"point": ""}) for item in answer.rubric_result]}
        )

    return read.model_copy(update={"answers": [clean(a) for a in read.answers]})


def get_result_test(db: Session, *, result_id: str, current_user: User) -> TestRead | TestReadStripped:
    """The test version a result was taken on, to show the answers next to the questions.

    When the answers are hidden (`_answers_hidden`), the answer key and the explanations are removed.
    """
    result, test = _get_result_and_test(db, result_id=result_id, current_user=current_user)
    if _answers_hidden(db, result=result, test=test, current_user=current_user):
        return without_explanations(build_stripped_test(test))
    return TestRead.model_validate(test)


def list_results(
    db: Session,
    *,
    current_user: User,
    search: str | None = None,
    score_min: float | None = None,
    score_max: float | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort_by: TestResultSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[TestResultListItem], int]:
    items, total = test_result_crud.list_by_user(
        db,
        user_id=current_user.id,
        search=search,
        score_min=score_min,
        score_max=score_max,
        created_from=created_from,
        created_to=created_to,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return [
        TestResultListItem.model_validate(result).model_copy(update={"space_title": space_title})
        for result, space_title in items
    ], total
