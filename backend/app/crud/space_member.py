from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Row, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus
from app.models.space_member import SpaceMember
from app.models.user import User


def list_active_roles(db: Session, *, user_id: str, space_ids: Sequence[str]) -> Sequence[Row[tuple[str, int]]]:
    """Return `(space_id, role)` of the ACTIVE memberships of `user_id` among `space_ids`.

    INVITED and REQUESTED rows give no access, so they are left out.
    """
    stmt = select(SpaceMember.space_id, SpaceMember.role).where(
        SpaceMember.user_id == user_id,
        SpaceMember.space_id.in_(space_ids),
        SpaceMember.status == int(MemberStatus.ACTIVE),
    )
    return db.execute(stmt).all()


def get(db: Session, *, space_id: str, user_id: str) -> SpaceMember | None:
    stmt = select(SpaceMember).where(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id)
    return db.scalars(stmt).first()


def get_for_update(db: Session, *, space_id: str, user_id: str) -> SpaceMember | None:
    """Like `get`, but locks the row until the transaction ends. Serializes the attempt starts of one user."""
    stmt = select(SpaceMember).where(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id).with_for_update()
    return db.scalars(stmt).first()


def get_statuses(db: Session, *, user_id: str, space_ids: Sequence[str]) -> dict[str, tuple[int, int]]:
    """`{space_id: (role, status)}` of the rows of `user_id` among `space_ids` (any status)."""
    if not space_ids:
        return {}
    stmt = select(SpaceMember.space_id, SpaceMember.role, SpaceMember.status).where(
        SpaceMember.user_id == user_id, SpaceMember.space_id.in_(space_ids)
    )
    return {space_id: (role, member_status) for space_id, role, member_status in db.execute(stmt).all()}


def list_srs_space_ids(db: Session, *, user_id: str, space_ids: Sequence[str]) -> set[str]:
    """The ids among `space_ids` where `user_id` is an ACTIVE member with `include_in_srs` on."""
    if not space_ids:
        return set()
    stmt = select(SpaceMember.space_id).where(
        SpaceMember.user_id == user_id,
        SpaceMember.space_id.in_(space_ids),
        SpaceMember.status == int(MemberStatus.ACTIVE),
        SpaceMember.include_in_srs.is_(True),
    )
    return set(db.scalars(stmt).all())


def list_for_user(db: Session, *, user_id: str, space_ids: Sequence[str]) -> Sequence[SpaceMember]:
    """The rows of `user_id` among `space_ids` (any status)."""
    if not space_ids:
        return []
    stmt = select(SpaceMember).where(SpaceMember.user_id == user_id, SpaceMember.space_id.in_(space_ids))
    return db.scalars(stmt).all()


def create(
    db: Session,
    *,
    space_id: str,
    user_id: str,
    role: int,
    status: int,
    invited_by: str | None,
    joined_at: datetime | None,
) -> SpaceMember:
    member = SpaceMember(
        space_id=space_id, user_id=user_id, role=role, status=status, invited_by=invited_by, joined_at=joined_at
    )
    db.add(member)
    db.flush()
    return member


def activate(db: Session, *, member: SpaceMember, joined_at: datetime) -> None:
    member.status = int(MemberStatus.ACTIVE)
    member.joined_at = joined_at
    db.flush()


def delete(db: Session, *, member: SpaceMember) -> None:
    db.delete(member)
    db.flush()


def list_with_users(db: Session, *, space_id: str) -> Sequence[tuple[SpaceMember, User]]:
    """All rows of a space (any status) with their user. Pending rows first, then by join date."""
    stmt = (
        select(SpaceMember, User)
        .join(User, User.id == SpaceMember.user_id)
        .where(SpaceMember.space_id == space_id)
        .order_by(SpaceMember.status, SpaceMember.created_at)
    )
    return db.execute(stmt).tuples().all()


def set_role(db: Session, *, member: SpaceMember, role: int) -> None:
    member.role = role
    db.flush()


def sync_completed_at(db: Session, *, space_id: str, done_user_ids: Sequence[str], at: datetime) -> None:
    """Set `completed_at` for the members in `done_user_ids` (when empty) and clear it for all others."""
    db.execute(
        sql_update(SpaceMember)
        .where(
            SpaceMember.space_id == space_id,
            SpaceMember.completed_at.is_not(None),
            SpaceMember.user_id.not_in(done_user_ids),
        )
        .values(completed_at=None)
    )
    if done_user_ids:
        db.execute(
            sql_update(SpaceMember)
            .where(
                SpaceMember.space_id == space_id,
                SpaceMember.completed_at.is_(None),
                SpaceMember.user_id.in_(done_user_ids),
            )
            .values(completed_at=at)
        )
    db.flush()
