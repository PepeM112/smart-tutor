"""Classroom routes. Shared actions use the `/spaces` routes (see docs/spaces.md, "Classrooms"):
get, update, archive, unarchive, delete forever, join code, members, join, leave and the edit mode.
"""

from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.enums import SpaceRole
from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.classroom_grades import AIKeyStatusRead, ClassroomTokenUsageRead, GradebookRead
from app.schemas.space import (
    ClassroomCourseCreate,
    ClassroomCourseDuplicate,
    ClassroomCreate,
    ClassroomSettingsRead,
    ClassroomSettingsUpdate,
    DueSoonItem,
    SpaceDetail,
    SpaceListStatus,
    SpaceSummary,
)
from app.services import classroom_ai_service, classroom_service, gradebook_service, space_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[SpaceSummary])
def list_mine(
    db: DbSession,
    current_user: CurrentUser,
    list_status: Annotated[SpaceListStatus, Query(alias="status")] = "active",
    role: Annotated[list[SpaceRole] | None, Query()] = None,
) -> list[SpaceSummary]:
    """Classrooms the user owns or is an active member of. Archived ones are hidden by default."""
    return space_service.list_my_classrooms(db, current_user=current_user, list_status=list_status, roles=role or ())


@router.post("", response_model=SpaceDetail, status_code=status.HTTP_201_CREATED)
def create(data: ClassroomCreate, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return classroom_service.create_classroom(db, current_user=current_user, data=data)


@router.get("/{classroom_id}/settings", response_model=ClassroomSettingsRead)
def get_settings(classroom_id: str, db: DbSession, current_user: CurrentUser) -> ClassroomSettingsRead:
    """Owner only."""
    return classroom_service.get_settings(db, classroom_id=classroom_id, current_user=current_user)


@router.patch("/{classroom_id}/settings", response_model=ClassroomSettingsRead)
def update_settings(
    classroom_id: str, data: ClassroomSettingsUpdate, db: DbSession, current_user: CurrentUser
) -> ClassroomSettingsRead:
    """Owner only. Only the sent fields change."""
    return classroom_service.update_settings(db, classroom_id=classroom_id, current_user=current_user, data=data)


@router.post("/{classroom_id}/courses", response_model=SpaceDetail, status_code=status.HTTP_201_CREATED)
def add_course(classroom_id: str, data: ClassroomCourseCreate, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    """A new course in a draft section of the classroom (edit mode). Returns the new course."""
    return classroom_service.add_course(db, classroom_id=classroom_id, current_user=current_user, data=data)


@router.post("/{classroom_id}/courses/duplicate", response_model=SpaceDetail, status_code=status.HTTP_201_CREATED)
def add_course_copy(
    classroom_id: str, data: ClassroomCourseDuplicate, db: DbSession, current_user: CurrentUser
) -> SpaceDetail:
    """ "Duplicate into classroom": copy the published content of one of my standalone courses."""
    return classroom_service.add_course_copy(db, classroom_id=classroom_id, current_user=current_user, data=data)


@router.get("/{classroom_id}/due-soon", response_model=list[DueSoonItem])
def due_soon(classroom_id: str, db: DbSession, current_user: CurrentUser) -> list[DueSoonItem]:
    """Items due in the next 24 hours that the current student has not done."""
    return classroom_service.due_soon(db, classroom_id=classroom_id, current_user=current_user)


@router.get("/{classroom_id}/gradebook", response_model=GradebookRead)
def gradebook(classroom_id: str, db: DbSession, current_user: CurrentUser) -> GradebookRead:
    """Owner or editor. Active students x published tests, plus the % of each course. Not paged."""
    return gradebook_service.get_gradebook(db, classroom_id=classroom_id, current_user=current_user)


@router.delete("/{classroom_id}/items/{item_id}/students/{user_id}/completion", status_code=status.HTTP_204_NO_CONTENT)
def remove_completion(classroom_id: str, item_id: str, user_id: str, db: DbSession, current_user: CurrentUser) -> None:
    """Owner or editor. Undo a pass of one student: only while the best score is below the pass threshold (409)."""
    classroom_service.remove_completion(
        db, classroom_id=classroom_id, item_id=item_id, user_id=user_id, current_user=current_user
    )


@router.get("/{classroom_id}/ai-key-status", response_model=AIKeyStatusRead)
def ai_key_status(classroom_id: str, db: DbSession, current_user: CurrentUser) -> AIKeyStatusRead:
    """Which key (Class, own or none) the user would use for AI in this classroom. Any member."""
    return classroom_ai_service.get_key_status(db, classroom_id=classroom_id, current_user=current_user)


@router.get("/{classroom_id}/token-usage", response_model=ClassroomTokenUsageRead)
def token_usage(classroom_id: str, db: DbSession, current_user: CurrentUser) -> ClassroomTokenUsageRead:
    """Owner only. Tokens and cost per student for this month and in total, split by key source."""
    return classroom_ai_service.get_token_usage(db, classroom_id=classroom_id, current_user=current_user)
