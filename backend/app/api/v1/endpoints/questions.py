from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.question import Question
from app.models.user import User
from app.schemas.correction import QuestionCheckRequest, QuestionCheckResponse
from app.schemas.question import (
    AssignQuestionRequest,
    BulkAssignQuestionsRequest,
    BulkAssignQuestionsResponse,
    BulkDeleteQuestionsRequest,
    BulkDeleteQuestionsResponse,
    PaginatedQuestionListRead,
    QuestionCreateStandalone,
    QuestionGrouping,
    QuestionRead,
    QuestionSortBy,
    QuestionUpdate,
    SortOrder,
)
from app.services import question_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=PaginatedQuestionListRead)
def list_(
    db: DbSession,
    current_user: CurrentUser,
    question_type: Annotated[list[int] | None, Query()] = None,
    test_id: Annotated[list[str] | None, Query()] = None,
    search: str | None = None,
    grouping: Annotated[QuestionGrouping | None, Query()] = None,
    sort_by: Annotated[QuestionSortBy | None, Query()] = None,
    sort_order: Annotated[SortOrder, Query()] = "desc",
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedQuestionListRead:
    items, total = question_service.list_questions(
        db,
        current_user=current_user,
        question_type=question_type,
        test_id=test_id,
        search=search,
        grouping=grouping,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return PaginatedQuestionListRead(items=items, total=total, page=page, per_page=per_page)


@router.post("", response_model=QuestionRead, status_code=status.HTTP_201_CREATED)
def create(data: QuestionCreateStandalone, db: DbSession, current_user: CurrentUser) -> Question:
    return question_service.create_question(db, current_user=current_user, data=data)


@router.get("/{question_id}", response_model=QuestionRead)
def get(question_id: str, db: DbSession, current_user: CurrentUser) -> Question:
    return question_service.get_question(db, question_id=question_id, current_user=current_user)


@router.put("/{question_id}", response_model=QuestionRead)
def update(question_id: str, data: QuestionUpdate, db: DbSession, current_user: CurrentUser) -> Question:
    return question_service.update_question(db, question_id=question_id, current_user=current_user, data=data)


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(question_id: str, db: DbSession, current_user: CurrentUser) -> None:
    question_service.delete_question(db, question_id=question_id, current_user=current_user)


@router.post("/{question_id}/check", response_model=QuestionCheckResponse)
def check(
    question_id: str, data: QuestionCheckRequest, db: DbSession, current_user: CurrentUser
) -> QuestionCheckResponse:
    """Check a single question answer and update SRS state."""
    return question_service.check_question(
        db, question_id=question_id, current_user=current_user, user_answer=data.user_answer
    )


@router.post("/{question_id}/assign", response_model=QuestionRead, status_code=status.HTTP_201_CREATED)
def assign_to_test(question_id: str, data: AssignQuestionRequest, db: DbSession, current_user: CurrentUser) -> Question:
    return question_service.assign_question_to_test(
        db, question_id=question_id, test_id=data.test_id, current_user=current_user
    )


@router.post("/{question_id}/duplicate", response_model=QuestionRead, status_code=status.HTTP_201_CREATED)
def duplicate(question_id: str, db: DbSession, current_user: CurrentUser) -> Question:
    """Copy a question (test-owned or bank) into the user's bank as a new standalone question."""
    return question_service.duplicate_question(db, question_id=question_id, current_user=current_user)


@router.post("/bulk-delete", response_model=BulkDeleteQuestionsResponse)
def bulk_delete(
    data: BulkDeleteQuestionsRequest, db: DbSession, current_user: CurrentUser
) -> BulkDeleteQuestionsResponse:
    """Delete every owned question in the batch. Questions the user doesn't own are skipped, not failed."""
    deleted = question_service.bulk_delete_questions(db, question_ids=data.question_ids, current_user=current_user)
    return BulkDeleteQuestionsResponse(deleted=deleted)


@router.post("/bulk-assign", response_model=BulkAssignQuestionsResponse)
def bulk_assign(
    data: BulkAssignQuestionsRequest, db: DbSession, current_user: CurrentUser
) -> BulkAssignQuestionsResponse:
    """Copy every owned question in the batch into the target test. Unowned questions are skipped, not failed."""
    assigned = question_service.bulk_assign_questions(
        db, question_ids=data.question_ids, test_id=data.test_id, current_user=current_user
    )
    return BulkAssignQuestionsResponse(assigned=assigned)
