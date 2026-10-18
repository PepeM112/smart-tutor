from datetime import datetime
from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.test import TestRead, TestReadStripped
from app.schemas.test_result import (
    PaginatedTestResultListItem,
    SortOrder,
    TestResultRead,
    TestResultSortBy,
)
from app.services import test_result_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.get("", response_model=PaginatedTestResultListItem)
def list_(
    db: DbSession,
    current_user: CurrentUser,
    search: str | None = None,
    score_min: Annotated[float | None, Query(ge=0, le=100)] = None,
    score_max: Annotated[float | None, Query(ge=0, le=100)] = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort_by: Annotated[TestResultSortBy | None, Query()] = None,
    sort_order: Annotated[SortOrder, Query()] = "desc",
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedTestResultListItem:
    items, total = test_result_service.list_results(
        db,
        current_user=current_user,
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
    return PaginatedTestResultListItem(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{result_id}", response_model=TestResultRead)
def get(result_id: str, db: DbSession, current_user: CurrentUser) -> TestResultRead:
    return test_result_service.get_result_read(db, result_id=result_id, current_user=current_user)


@router.get("/{result_id}/test", response_model=TestRead | TestReadStripped)
def get_test(result_id: str, db: DbSession, current_user: CurrentUser) -> TestRead | TestReadStripped:
    """The test version of a result. A VIEWER of a course gets it without answers until the item reveals them."""
    return test_result_service.get_result_test(db, result_id=result_id, current_user=current_user)
