from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import KeyScope, MemberStatus, SpaceKind, SpaceRole, SpaceStatus
from app.models.classroom_settings import ClassroomSettings
from app.models.space import Space
from app.models.space_member import SpaceMember


def list_funding_personal_ai(db: Session, *, user_id: str) -> Sequence[tuple[Space, ClassroomSettings]]:
    """Active classrooms where the user is an ACTIVE student and the Class key is set with scope ALL.

    These classrooms may pay for the personal AI of the user. The order is fixed (oldest classroom first,
    then by id), so the same classroom pays every time.
    """
    stmt = (
        select(Space, ClassroomSettings)
        .join(ClassroomSettings, ClassroomSettings.space_id == Space.id)
        .join(SpaceMember, SpaceMember.space_id == Space.id)
        .where(
            SpaceMember.user_id == user_id,
            SpaceMember.status == int(MemberStatus.ACTIVE),
            SpaceMember.role == int(SpaceRole.VIEWER),
            Space.kind == int(SpaceKind.CLASSROOM),
            Space.status == int(SpaceStatus.ACTIVE),
            ClassroomSettings.key_scope == int(KeyScope.ALL),
            ClassroomSettings.encrypted_class_key.is_not(None),
            ClassroomSettings.ai_provider.is_not(None),
        )
        .order_by(Space.created_at, Space.id)
    )
    return db.execute(stmt).tuples().all()


def get(db: Session, *, space_id: str) -> ClassroomSettings | None:
    return db.get(ClassroomSettings, space_id)


def create(db: Session, *, space_id: str) -> ClassroomSettings:
    """A settings row with the column defaults. Made together with the classroom."""
    settings = ClassroomSettings(space_id=space_id)
    db.add(settings)
    db.flush()
    return settings
