from datetime import datetime
from typing import Annotated, TypeAlias

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.test import Test
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.test import (
    PaginatedTestRead,
    SortOrder,
    TestCreate,
    TestRead,
    TestReadStripped,
    TestSortBy,
    TestUpdate,
)
from app.schemas.test_generation import (
    QuestionEditRequest,
    TestGenerationRequest,
    TestGenerationResponse,
    TestRefinementRequest,
)
from app.schemas.test_result import TestResultRead
from app.services import correction_service, test_generation_service, test_service
from app.services.grading_service import grade_pending_answers
from app.services.question_helpers import build_stripped_test

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=PaginatedTestRead)
def list_(
    db: DbSession,
    current_user: CurrentUser,
    search: str | None = None,
    question_type: Annotated[list[int] | None, Query()] = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort_by: Annotated[TestSortBy | None, Query()] = None,
    sort_order: Annotated[SortOrder, Query()] = "desc",
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedTestRead:
    items, total = test_service.list_tests(
        db,
        current_user=current_user,
        search=search,
        question_type=question_type,
        created_from=created_from,
        created_to=created_to,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return PaginatedTestRead(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{test_id}", response_model=TestRead)
def get(test_id: str, db: DbSession, current_user: CurrentUser) -> Test:
    return test_service.get_test(db, test_id=test_id, current_user=current_user)


@router.get("/{test_id}/exam", response_model=TestReadStripped)
def get_exam(test_id: str, db: DbSession, current_user: CurrentUser) -> TestReadStripped:
    test = test_service.get_test(db, test_id=test_id, current_user=current_user)
    return build_stripped_test(test)


@router.post("/generate", response_model=TestGenerationResponse)
def generate(data: TestGenerationRequest, db: DbSession, current_user: CurrentUser) -> TestGenerationResponse:
    return test_generation_service.generate_test_questions(db, current_user=current_user, data=data)


@router.post("/generate/refine", response_model=TestGenerationResponse)
def refine(data: TestRefinementRequest, db: DbSession, current_user: CurrentUser) -> TestGenerationResponse:
    return test_generation_service.refine_test_questions(db, current_user=current_user, data=data)


@router.post("/generate/edit-questions", response_model=TestGenerationResponse)
def edit_questions(data: QuestionEditRequest, db: DbSession, current_user: CurrentUser) -> TestGenerationResponse:
    return test_generation_service.edit_test_questions(db, current_user=current_user, data=data)


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
def submit(
    test_id: str,
    data: TestSubmission,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> TestResult:
    test_result = correction_service.correct_test(db, test_id=test_id, current_user=current_user, submission=data)
    if test_result.pending_answers > 0:
        background_tasks.add_task(grade_pending_answers, test_result.id)
    return test_result
