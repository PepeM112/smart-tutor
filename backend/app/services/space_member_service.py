"""Course members: join (link or code), invite, request, approve, remove, leave, change role.

Member rows: INVITED (the owner asked, the user must accept), REQUESTED (the user asked, the owner
must approve), ACTIVE (access). Only ACTIVE rows give access (see access_service).
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus, SpaceRole, SpaceStatus, SpaceVisibility
from app.crud import space as space_crud
from app.crud import space_member as space_member_crud
from app.crud import user as user_crud
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.models.user import User
from app.schemas.space import SpaceDetail, SpaceMemberRead
from app.services.space_service import (
    build_detail,
    conflict,
    get_course_or_404,
    get_membership,
    now,
    require_active,
    require_author,
    require_owner,
)

# Join by link (the course id) gives access at once for these. PRIVATE makes a request.
_SELF_ENROLL_VISIBILITIES = frozenset({int(SpaceVisibility.PUBLIC), int(SpaceVisibility.UNLISTED)})


def _require_joinable(space: Space) -> None:
    """Nobody can join a course that was never published (there is nothing to see) or is archived."""
    if space.published_at is None:
        raise conflict("The course is not published yet")
    if space.status != int(SpaceStatus.ACTIVE):
        raise conflict("The course is archived")


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _get_row_or_404(db: Session, *, space_id: str, user_id: str) -> SpaceMember:
    row = space_member_crud.get(db, space_id=space_id, user_id=user_id)
    if row is None:
        raise _not_found("Member not found")
    return row


def _add_viewer(db: Session, *, space: Space, user: User, member_status: MemberStatus, invited_by: str | None) -> None:
    space_member_crud.create(
        db,
        space_id=space.id,
        user_id=user.id,
        role=int(SpaceRole.VIEWER),
        status=int(member_status),
        invited_by=invited_by,
        joined_at=now() if member_status == MemberStatus.ACTIVE else None,
    )


# ── The current user ──────────────────────────────────────────────────────────


def join(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    """Join by link. PUBLIC / UNLISTED: ACTIVE at once. PRIVATE: a request the owner approves.

    A pending invitation is accepted. A repeated call changes nothing.
    """
    space = get_course_or_404(db, space_id=space_id)
    _require_joinable(space)
    membership = get_membership(db, space=space, user=current_user)
    row = membership.row
    if membership.role is None:
        if row is None:
            self_enroll = space.visibility in _SELF_ENROLL_VISIBILITIES
            member_status = MemberStatus.ACTIVE if self_enroll else MemberStatus.REQUESTED
            _add_viewer(db, space=space, user=current_user, member_status=member_status, invited_by=None)
        elif row.status == int(MemberStatus.INVITED):
            space_member_crud.activate(db, member=row, joined_at=now())
        db.commit()
    return build_detail(db, space=space, current_user=current_user)


def join_by_code(db: Session, *, code: str, current_user: User) -> SpaceDetail:
    """The code is the secret: it gives access for every visibility, PRIVATE too."""
    space = space_crud.get_by_join_code(db, code=code.strip().lower())
    if space is None:
        raise _not_found("No course has this code")
    space = get_course_or_404(db, space_id=space.id)
    _require_joinable(space)
    membership = get_membership(db, space=space, user=current_user)
    if membership.role is None:
        if membership.row is None:
            _add_viewer(db, space=space, user=current_user, member_status=MemberStatus.ACTIVE, invited_by=None)
        else:
            space_member_crud.activate(db, member=membership.row, joined_at=now())
        db.commit()
    return build_detail(db, space=space, current_user=current_user)


def accept_invitation(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    space = get_course_or_404(db, space_id=space_id)
    row = space_member_crud.get(db, space_id=space.id, user_id=current_user.id)
    if row is None or row.status != int(MemberStatus.INVITED):
        raise _not_found("Invitation not found")
    _require_joinable(space)
    space_member_crud.activate(db, member=row, joined_at=now())
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def decline_invitation(db: Session, *, space_id: str, current_user: User) -> None:
    space = get_course_or_404(db, space_id=space_id)
    row = space_member_crud.get(db, space_id=space.id, user_id=current_user.id)
    if row is None or row.status != int(MemberStatus.INVITED):
        raise _not_found("Invitation not found")
    space_member_crud.delete(db, member=row)
    db.commit()


def leave(db: Session, *, space_id: str, current_user: User) -> None:
    """Remove the own row (also a pending request). The owner can not leave: delete or archive instead."""
    space = get_course_or_404(db, space_id=space_id)
    if space.owner_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The owner can not leave the course")
    row = _get_row_or_404(db, space_id=space.id, user_id=current_user.id)
    space_member_crud.delete(db, member=row)
    db.commit()


# ── The owner ─────────────────────────────────────────────────────────────────


def list_members(db: Session, *, space_id: str, current_user: User) -> list[SpaceMemberRead]:
    """OWNER / EDITOR only: viewers do not see the other members."""
    space = get_course_or_404(db, space_id=space_id)
    require_author(db, space=space, user=current_user)
    return [
        SpaceMemberRead(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            role=SpaceRole(member.role),
            status=MemberStatus(member.status),
            joined_at=member.joined_at,
            created_at=member.created_at,
        )
        for member, user in space_member_crud.list_with_users(db, space_id=space.id)
    ]


def invite(db: Session, *, space_id: str, current_user: User, identifier: str) -> None:
    """Invite an existing user by username or email. A pending request of that user is approved."""
    space = get_course_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    require_active(space)
    identifier = identifier.strip()
    user = (
        user_crud.get_by_email(db, email=identifier)
        if "@" in identifier
        else user_crud.get_by_username(db, username=identifier)
    )
    if user is None:
        raise _not_found("User not found")
    if user.id == space.owner_id:
        raise conflict("The owner is already in the course")
    row = space_member_crud.get(db, space_id=space.id, user_id=user.id)
    if row is None:
        _add_viewer(db, space=space, user=user, member_status=MemberStatus.INVITED, invited_by=current_user.id)
    elif row.status == int(MemberStatus.REQUESTED):
        space_member_crud.activate(db, member=row, joined_at=now())
    else:
        raise conflict("The user is already invited or a member")
    db.commit()


def approve_request(db: Session, *, space_id: str, user_id: str, current_user: User) -> None:
    space = get_course_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    require_active(space)
    row = _get_row_or_404(db, space_id=space.id, user_id=user_id)
    if row.status != int(MemberStatus.REQUESTED):
        raise conflict("There is no request to approve")
    space_member_crud.activate(db, member=row, joined_at=now())
    db.commit()


def remove_member(db: Session, *, space_id: str, user_id: str, current_user: User) -> None:
    """Remove a member, deny a request or cancel an invitation. Also allowed in an archived course."""
    space = get_course_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    row = _get_row_or_404(db, space_id=space.id, user_id=user_id)
    space_member_crud.delete(db, member=row)
    db.commit()


def set_role(db: Session, *, space_id: str, user_id: str, current_user: User, role: SpaceRole) -> None:
    """EDITOR or VIEWER, on an ACTIVE member only."""
    space = get_course_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    require_active(space)
    row = _get_row_or_404(db, space_id=space.id, user_id=user_id)
    if row.status != int(MemberStatus.ACTIVE):
        raise conflict("Only active members can get a role")
    space_member_crud.set_role(db, member=row, role=int(role))
    db.commit()
