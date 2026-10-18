"""Members of a course or a classroom: join (link or code), invite, request, approve, remove, leave, change role.

Member rows: INVITED (the owner asked, the user must accept), REQUESTED (the user asked, the owner
must approve), ACTIVE (access). Only ACTIVE rows give access (see access_service).

A classroom has co-teachers (EDITOR rows). They invite, approve and remove STUDENTS (VIEWER rows). Only the
owner adds, promotes or removes co-teachers. A course of a classroom has no members of its own: the
progress and Review settings of a student are in a lazy row (`role` NULL, see `space_progress_service`).
"""

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus, SpaceItemKind, SpaceKind, SpaceRole, SpaceVisibility
from app.crud import space as space_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import space_member as space_member_crud
from app.crud import user as user_crud
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_member import SpaceMember
from app.models.user import User
from app.schemas.space import SpaceDetail, SpaceMemberRead, SpaceProgress
from app.services import space_progress_service
from app.services.space_service import (
    Membership,
    build_detail,
    conflict,
    forbidden,
    get_joinable_or_404,
    get_membership,
    get_space_or_404,
    is_archived,
    now,
    require_active,
    require_author,
    require_owner,
)

# Join by link (the course id) gives access at once for these. PRIVATE makes a request.
_SELF_ENROLL_VISIBILITIES = frozenset({int(SpaceVisibility.PUBLIC), int(SpaceVisibility.UNLISTED)})


def _is_classroom(space: Space) -> bool:
    return space.kind == int(SpaceKind.CLASSROOM)


def _require_joinable(db: Session, space: Space) -> None:
    """Nobody can join a course that was never published (there is nothing to see) or is archived.

    A classroom can be joined before its first publish: the teacher invites the students first.
    """
    if not _is_classroom(space) and space.published_at is None:
        raise conflict("The course is not published yet")
    if is_archived(db, space=space):
        raise conflict("The classroom is archived" if _is_classroom(space) else "The course is archived")


def _require_manager(db: Session, *, space: Space, user: User) -> Membership:
    """Who invites, approves and removes students: the owner of a course; the owner or a co-teacher of a classroom."""
    return (
        require_author(db, space=space, user=user)
        if _is_classroom(space)
        else require_owner(db, space=space, user=user)
    )


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _get_row_or_404(db: Session, *, space_id: str, user_id: str) -> SpaceMember:
    row = space_member_crud.get(db, space_id=space_id, user_id=user_id)
    if row is None:
        raise _not_found("Member not found")
    return row


def _add_viewer(db: Session, *, space: Space, user: User, member_status: MemberStatus, invited_by: str | None) -> None:
    """A savepoint: when a parallel call (a double click) added the row first, keep that row, not a 500."""
    try:
        with db.begin_nested():
            space_member_crud.create(
                db,
                space_id=space.id,
                user_id=user.id,
                role=int(SpaceRole.VIEWER),
                status=int(member_status),
                invited_by=invited_by,
                joined_at=now() if member_status == MemberStatus.ACTIVE else None,
            )
    except IntegrityError:
        pass


# ── The current user ──────────────────────────────────────────────────────────


def join(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    """Join by link. PUBLIC / UNLISTED: ACTIVE at once. PRIVATE: a request the owner approves.

    A pending invitation is accepted. A repeated call changes nothing.
    """
    space = get_joinable_or_404(db, space_id=space_id)
    _require_joinable(db, space)
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
    space = get_joinable_or_404(db, space_id=space.id)
    _require_joinable(db, space)
    membership = get_membership(db, space=space, user=current_user)
    if membership.role is None:
        if membership.row is None:
            _add_viewer(db, space=space, user=current_user, member_status=MemberStatus.ACTIVE, invited_by=None)
        else:
            space_member_crud.activate(db, member=membership.row, joined_at=now())
        db.commit()
    return build_detail(db, space=space, current_user=current_user)


def accept_invitation(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    space = get_joinable_or_404(db, space_id=space_id)
    row = space_member_crud.get(db, space_id=space.id, user_id=current_user.id)
    if row is None or row.status != int(MemberStatus.INVITED):
        raise _not_found("Invitation not found")
    _require_joinable(db, space)
    space_member_crud.activate(db, member=row, joined_at=now())
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def decline_invitation(db: Session, *, space_id: str, current_user: User) -> None:
    space = get_joinable_or_404(db, space_id=space_id)
    row = space_member_crud.get(db, space_id=space.id, user_id=current_user.id)
    if row is None or row.status != int(MemberStatus.INVITED):
        raise _not_found("Invitation not found")
    space_member_crud.delete(db, member=row)
    db.commit()


def leave(db: Session, *, space_id: str, current_user: User) -> None:
    """Remove the own row (also a pending request). The owner can not leave: delete or archive instead."""
    space = get_joinable_or_404(db, space_id=space_id)
    if space.owner_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The owner can not leave the course")
    row = _get_row_or_404(db, space_id=space.id, user_id=current_user.id)
    space_member_crud.delete(db, member=row)
    _drop_course_rows(db, space=space, user_id=current_user.id)
    db.commit()


def _drop_course_rows(db: Session, *, space: Space, user_id: str) -> None:
    """Leaving or removal from a classroom ends the access to its courses: delete the rows of the user there."""
    if _is_classroom(space):
        space_member_crud.delete_in_children(db, parent_id=space.id, user_id=user_id)


# ── The owner ─────────────────────────────────────────────────────────────────


def list_members(db: Session, *, space_id: str, current_user: User) -> list[SpaceMemberRead]:
    """OWNER / EDITOR only: viewers do not see the other members."""
    space = get_joinable_or_404(db, space_id=space_id)
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
    space = get_joinable_or_404(db, space_id=space_id)
    _require_manager(db, space=space, user=current_user)
    require_active(db, space)
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
    space = get_joinable_or_404(db, space_id=space_id)
    _require_manager(db, space=space, user=current_user)
    require_active(db, space)
    row = _get_row_or_404(db, space_id=space.id, user_id=user_id)
    if row.status != int(MemberStatus.REQUESTED):
        raise conflict("There is no request to approve")
    space_member_crud.activate(db, member=row, joined_at=now())
    db.commit()


def remove_member(db: Session, *, space_id: str, user_id: str, current_user: User) -> None:
    """Remove a member, deny a request or cancel an invitation. Also allowed in an archived course.

    In a classroom a co-teacher removes students only. Removing a co-teacher is for the owner.
    """
    space = get_joinable_or_404(db, space_id=space_id)
    membership = _require_manager(db, space=space, user=current_user)
    row = _get_row_or_404(db, space_id=space.id, user_id=user_id)
    if row.role == int(SpaceRole.EDITOR) and not membership.is_owner:
        raise forbidden("Only the owner can do this")
    space_member_crud.delete(db, member=row)
    _drop_course_rows(db, space=space, user_id=user_id)
    db.commit()


def set_role(db: Session, *, space_id: str, user_id: str, current_user: User, role: SpaceRole) -> None:
    """EDITOR or VIEWER, on an ACTIVE member only."""
    space = get_joinable_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    require_active(db, space)
    row = _get_row_or_404(db, space_id=space.id, user_id=user_id)
    if row.status != int(MemberStatus.ACTIVE):
        raise conflict("Only active members can get a role")
    space_member_crud.set_role(db, member=row, role=int(role))
    db.commit()


# ── Progress of the current user ──────────────────────────────────────────────


def _get_published_item_or_404(db: Session, *, space: Space, item_id: str, hide_future: bool) -> SpaceItem:
    """`hide_future`: a student gets 404 for an item that is not visible yet (`visible_from`)."""
    item = space_item_crud.get(db, item_id=item_id)
    if (
        item is None
        or item.space_id != space.id
        or item.is_draft
        or (hide_future and space_progress_service.is_hidden(item, at=now()))
    ):
        raise _not_found("Item not found")
    return item


def _progress_of(db: Session, *, space_id: str, user_id: str) -> SpaceProgress:
    return space_progress_service.course_progress(db, space_ids=[space_id], user_id=user_id).get(
        space_id, SpaceProgress(completed_items=0, total_items=0, percent=0)
    )


def set_item_completed(
    db: Session, *, space_id: str, item_id: str, current_user: User, completed: bool
) -> SpaceProgress:
    """Mark (or unmark) a NOTE item as done. A TEST item is completed by its attempts, never by hand.

    Owner and editor preview the course: no row is written. An archived course is read-only.
    """
    space = get_space_or_404(db, space_id=space_id)
    membership = get_membership(db, space=space, user=current_user)
    if membership.role is None:
        raise forbidden()
    item = _get_published_item_or_404(db, space=space, item_id=item_id, hide_future=membership.role == SpaceRole.VIEWER)
    if item.kind != int(SpaceItemKind.NOTE):
        raise conflict("Only notes can be marked as done")
    require_active(db, space)
    if membership.role != SpaceRole.VIEWER:
        return _progress_of(db, space_id=space.id, user_id=current_user.id)
    if completed:
        space_item_completion_crud.add(db, item_id=item.id, user_id=current_user.id, completed_at=now())
    else:
        space_item_completion_crud.remove(db, item_id=item.id, user_id=current_user.id)
    space_progress_service.sync_member_completion(db, space_id=space.id, user_id=current_user.id)
    db.commit()
    return _progress_of(db, space_id=space.id, user_id=current_user.id)


def set_membership(db: Session, *, space_id: str, current_user: User, include_in_srs: bool) -> SpaceDetail:
    """Change the own settings of the member: now only `include_in_srs` (the course questions in Review).

    Any ACTIVE member can do it (VIEWER or EDITOR). The owner has no row. This is a personal
    setting, so it is allowed in an archived course too (the questions stay readable).
    A student of a classroom has no row in its courses yet: the first call makes a lazy row.
    """
    space = get_space_or_404(db, space_id=space_id)
    membership = get_membership(db, space=space, user=current_user)
    if membership.role is None:
        raise forbidden()
    row = space_progress_service.get_member_row(db, space_id=space.id, user_id=current_user.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The owner has no membership to change")
    row.include_in_srs = include_in_srs
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def record_visit(db: Session, *, space_id: str, item_id: str, current_user: User) -> None:
    """Remember the last item the VIEWER opened ("continue where you left off"). Allowed in an archived course."""
    space = get_space_or_404(db, space_id=space_id)
    membership = get_membership(db, space=space, user=current_user)
    if membership.role is None:
        raise forbidden()
    item = _get_published_item_or_404(db, space=space, item_id=item_id, hide_future=membership.role == SpaceRole.VIEWER)
    if membership.role != SpaceRole.VIEWER:
        return
    row = space_progress_service.get_member_row(db, space_id=space.id, user_id=current_user.id)
    if row is None:
        return
    row.last_item_id = item.id
    row.last_accessed_at = now()
    db.commit()
