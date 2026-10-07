from collections.abc import Sequence

from sqlalchemy import Row, select
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus
from app.models.space_member import SpaceMember


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
