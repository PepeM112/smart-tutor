from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.enums import SpaceRole, SpaceVisibility
from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.space import (
    PaginatedSpaceSummary,
    SpaceCatalogSort,
    SpaceCreate,
    SpaceDeleteConfirm,
    SpaceDetail,
    SpaceDraftOrder,
    SpaceDuplicateRequest,
    SpaceInvite,
    SpaceItemContent,
    SpaceItemCopy,
    SpaceItemCreate,
    SpaceJoinByCode,
    SpaceListStatus,
    SpaceMemberRead,
    SpaceMemberRoleUpdate,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceSectionUpdate,
    SpaceSummary,
    SpaceUpdate,
)
from app.services import space_draft_service, space_member_service, space_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


# ── Lists (declared before `/{space_id}`, so "catalog" is not read as an id) ──


@router.get("", response_model=list[SpaceSummary])
def list_mine(
    db: DbSession,
    current_user: CurrentUser,
    status: Annotated[SpaceListStatus, Query()] = "active",
    visibility: Annotated[list[SpaceVisibility] | None, Query()] = None,
    role: Annotated[list[SpaceRole] | None, Query()] = None,
) -> list[SpaceSummary]:
    """Courses the user owns or is an active member of. Archived courses are hidden by default."""
    return space_service.list_my_courses(
        db, current_user=current_user, status=status, visibility=visibility or (), roles=role or ()
    )


@router.get("/catalog", response_model=PaginatedSpaceSummary)
def catalog(
    db: DbSession,
    current_user: CurrentUser,
    search: str | None = None,
    sort: SpaceCatalogSort = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PaginatedSpaceSummary:
    items, total = space_service.list_catalog(
        db, current_user=current_user, search=search, sort=sort, page=page, per_page=per_page
    )
    return PaginatedSpaceSummary(items=items, total=total, page=page, per_page=per_page)


@router.get("/invitations", response_model=list[SpaceSummary])
def invitations(db: DbSession, current_user: CurrentUser) -> list[SpaceSummary]:
    return space_service.list_invitations(db, current_user=current_user)


@router.post("/join", response_model=SpaceDetail)
def join_by_code(data: SpaceJoinByCode, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_member_service.join_by_code(db, code=data.code, current_user=current_user)


# ── Course ────────────────────────────────────────────────────────────────────


@router.post("", response_model=SpaceDetail, status_code=status.HTTP_201_CREATED)
def create(data: SpaceCreate, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_service.create_course(db, current_user=current_user, data=data)


@router.get("/{space_id}", response_model=SpaceDetail)
def get(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_service.get_course(db, space_id=space_id, current_user=current_user)


@router.patch("/{space_id}", response_model=SpaceDetail)
def update(space_id: str, data: SpaceUpdate, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_service.update_course(db, space_id=space_id, current_user=current_user, data=data)


@router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_forever(space_id: str, data: SpaceDeleteConfirm, db: DbSession, current_user: CurrentUser) -> None:
    """Hard delete. The body must repeat the exact title of the course."""
    space_service.delete_course_forever(db, space_id=space_id, current_user=current_user, confirm_title=data.title)


@router.post("/{space_id}/archive", response_model=SpaceDetail)
def archive(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_service.set_archived(db, space_id=space_id, current_user=current_user, archived=True)


@router.post("/{space_id}/unarchive", response_model=SpaceDetail)
def unarchive(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_service.set_archived(db, space_id=space_id, current_user=current_user, archived=False)


@router.post("/{space_id}/join-code", response_model=SpaceDetail)
def regenerate_join_code(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_service.regenerate_join_code(db, space_id=space_id, current_user=current_user)


@router.post("/{space_id}/duplicate", response_model=SpaceDetail, status_code=status.HTTP_201_CREATED)
def duplicate(space_id: str, data: SpaceDuplicateRequest, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_service.duplicate_course(db, space_id=space_id, current_user=current_user, data=data)


# ── Edit mode ─────────────────────────────────────────────────────────────────


@router.post("/{space_id}/draft", response_model=SpaceDetail)
def enter_edit_mode(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_draft_service.enter_edit_mode(db, space_id=space_id, current_user=current_user)


@router.post("/{space_id}/draft/discard", response_model=SpaceDetail)
def discard_draft(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_draft_service.discard(db, space_id=space_id, current_user=current_user)


@router.post("/{space_id}/draft/publish", response_model=SpaceDetail)
def publish(space_id: str, data: SpacePublishRequest, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_draft_service.publish(db, space_id=space_id, current_user=current_user, data=data)


@router.put("/{space_id}/draft/order", response_model=SpaceDetail)
def reorder_draft(space_id: str, data: SpaceDraftOrder, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_draft_service.reorder(db, space_id=space_id, current_user=current_user, data=data)


@router.post("/{space_id}/sections", response_model=SpaceDetail, status_code=status.HTTP_201_CREATED)
def add_section(space_id: str, data: SpaceSectionCreate, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_draft_service.add_section(db, space_id=space_id, current_user=current_user, data=data)


@router.patch("/{space_id}/sections/{section_id}", response_model=SpaceDetail)
def rename_section(
    space_id: str, section_id: str, data: SpaceSectionUpdate, db: DbSession, current_user: CurrentUser
) -> SpaceDetail:
    return space_draft_service.rename_section(
        db, space_id=space_id, section_id=section_id, current_user=current_user, data=data
    )


@router.delete("/{space_id}/sections/{section_id}", response_model=SpaceDetail)
def delete_section(space_id: str, section_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_draft_service.delete_section(db, space_id=space_id, section_id=section_id, current_user=current_user)


@router.post("/{space_id}/items", response_model=SpaceItemContent, status_code=status.HTTP_201_CREATED)
def create_item(space_id: str, data: SpaceItemCreate, db: DbSession, current_user: CurrentUser) -> SpaceItemContent:
    return space_draft_service.create_item(db, space_id=space_id, current_user=current_user, data=data)


@router.post("/{space_id}/items/copy", response_model=SpaceItemContent, status_code=status.HTTP_201_CREATED)
def copy_item(space_id: str, data: SpaceItemCopy, db: DbSession, current_user: CurrentUser) -> SpaceItemContent:
    """Copy a personal note or test into the course."""
    return space_draft_service.copy_item(db, space_id=space_id, current_user=current_user, data=data)


@router.delete("/{space_id}/items/{item_id}", response_model=SpaceDetail)
def delete_item(space_id: str, item_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_draft_service.delete_item(db, space_id=space_id, item_id=item_id, current_user=current_user)


@router.post("/{space_id}/items/{item_id}/draft", response_model=SpaceItemContent)
def make_item_editable(space_id: str, item_id: str, db: DbSession, current_user: CurrentUser) -> SpaceItemContent:
    """The id of the note / test to edit for this item (its draft twin is made on the first call)."""
    return space_draft_service.make_editable(db, space_id=space_id, item_id=item_id, current_user=current_user)


# ── Members ───────────────────────────────────────────────────────────────────


@router.post("/{space_id}/join", response_model=SpaceDetail)
def join(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    """Join by link: active at once for PUBLIC / UNLISTED, a request for PRIVATE."""
    return space_member_service.join(db, space_id=space_id, current_user=current_user)


@router.post("/{space_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave(space_id: str, db: DbSession, current_user: CurrentUser) -> None:
    space_member_service.leave(db, space_id=space_id, current_user=current_user)


@router.post("/{space_id}/invitation/accept", response_model=SpaceDetail)
def accept_invitation(space_id: str, db: DbSession, current_user: CurrentUser) -> SpaceDetail:
    return space_member_service.accept_invitation(db, space_id=space_id, current_user=current_user)


@router.post("/{space_id}/invitation/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_invitation(space_id: str, db: DbSession, current_user: CurrentUser) -> None:
    space_member_service.decline_invitation(db, space_id=space_id, current_user=current_user)


@router.get("/{space_id}/members", response_model=list[SpaceMemberRead])
def list_members(space_id: str, db: DbSession, current_user: CurrentUser) -> list[SpaceMemberRead]:
    return space_member_service.list_members(db, space_id=space_id, current_user=current_user)


@router.post("/{space_id}/members", status_code=status.HTTP_204_NO_CONTENT)
def invite(space_id: str, data: SpaceInvite, db: DbSession, current_user: CurrentUser) -> None:
    space_member_service.invite(db, space_id=space_id, current_user=current_user, identifier=data.identifier)


@router.post("/{space_id}/members/{user_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
def approve_request(space_id: str, user_id: str, db: DbSession, current_user: CurrentUser) -> None:
    space_member_service.approve_request(db, space_id=space_id, user_id=user_id, current_user=current_user)


@router.patch("/{space_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def set_member_role(
    space_id: str, user_id: str, data: SpaceMemberRoleUpdate, db: DbSession, current_user: CurrentUser
) -> None:
    space_member_service.set_role(db, space_id=space_id, user_id=user_id, current_user=current_user, role=data.role)


@router.delete("/{space_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(space_id: str, user_id: str, db: DbSession, current_user: CurrentUser) -> None:
    """Remove a member, deny a request or cancel an invitation."""
    space_member_service.remove_member(db, space_id=space_id, user_id=user_id, current_user=current_user)
