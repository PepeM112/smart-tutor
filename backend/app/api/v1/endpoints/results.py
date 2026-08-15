from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.test_result import (
    PaginatedTestResultListItem,
    SortOrder,
    TestResultRead,
    TestResultSortBy,
)
from app.services import test_result_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=PaginatedTestResultListItem)
def list_(
    db: DbSession,
    current_user: CurrentUser,
    search: str | None = None,
    sort_by: Annotated[TestResultSortBy | None, Query()] = None,
    sort_order: Annotated[SortOrder, Query()] = "desc",
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedTestResultListItem:
    items, total = test_result_service.list_results(
        db,
        current_user=current_user,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return PaginatedTestResultListItem(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{result_id}", response_model=TestResultRead)
def get(result_id: str, db: DbSession, current_user: CurrentUser) -> TestResult:
    return test_result_service.get_result(db, result_id=result_id, current_user=current_user)
