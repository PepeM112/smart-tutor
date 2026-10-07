from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import ScalarSelect, Select, String, cast, func, or_, select
from sqlalchemy import delete as sql_delete
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus, SpaceKind, SpaceStatus, SpaceVisibility
from app.crud.helpers import token_search
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.schemas.space import SpaceCatalogSort, SpaceUpdate

# Standalone courses. Classroom courses (M4) have a parent and never show in these lists.
STANDALONE_COURSE = (Space.kind == int(SpaceKind.COURSE), Space.parent_id.is_(None))


def get_by_id(db: Session, *, id: str) -> Space | None:
    stmt = select(Space).where(Space.id == id)
    return db.scalars(stmt).first()


def get_by_id_for_update(db: Session, *, id: str) -> Space | None:
    """Like `get_by_id`, but locks the row until the transaction ends (SELECT … FOR UPDATE).

    The draft engine locks the space, so two editors can not enter edit mode or publish at the same time.
    """
    stmt = select(Space).where(Space.id == id).with_for_update()
    return db.scalars(stmt).first()


def get_by_join_code(db: Session, *, code: str) -> Space | None:
    stmt = select(Space).where(Space.join_code == code)
    return db.scalars(stmt).first()


def join_code_exists(db: Session, *, code: str) -> bool:
    return db.execute(select(Space.id).where(Space.join_code == code).limit(1)).first() is not None


def create(
    db: Session,
    *,
    kind: int,
    owner_id: str,
    title: str,
    description: str,
    tags: list[str],
    visibility: int,
    join_code: str,
    draft_started_at: datetime | None,
) -> Space:
    space = Space(
        kind=kind,
        owner_id=owner_id,
        title=title,
        description=description,
        tags=tags,
        visibility=visibility,
        join_code=join_code,
        draft_started_at=draft_started_at,
    )
    db.add(space)
    db.flush()
    return space


def update(db: Session, *, space: Space, data: SpaceUpdate) -> Space:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(space, field, value)
    db.flush()
    return space


def delete(db: Session, *, space: Space) -> None:
    """Hard delete. The DB cascade removes members, structure, notes and (childless) tests."""
    db.execute(sql_delete(Space).where(Space.id == space.id))
    db.flush()


def _active_member_count() -> ScalarSelect[int]:
    """Correlated subquery: the number of ACTIVE members of `Space` (the owner not included)."""
    return (
        select(func.count())
        .select_from(SpaceMember)
        .where(SpaceMember.space_id == Space.id, SpaceMember.status == int(MemberStatus.ACTIVE))
        .scalar_subquery()
    )


def count_active_members(db: Session, *, space_ids: Sequence[str]) -> dict[str, int]:
    if not space_ids:
        return {}
    stmt = (
        select(SpaceMember.space_id, func.count())
        .where(SpaceMember.space_id.in_(space_ids), SpaceMember.status == int(MemberStatus.ACTIVE))
        .group_by(SpaceMember.space_id)
    )
    return {space_id: count for space_id, count in db.execute(stmt).all()}


def list_for_user(db: Session, *, user_id: str) -> Sequence[Space]:
    """Standalone courses the user owns or is an ACTIVE member of. Newest first."""
    member_of = select(SpaceMember.space_id).where(
        SpaceMember.user_id == user_id, SpaceMember.status == int(MemberStatus.ACTIVE)
    )
    stmt = (
        select(Space)
        .where(*STANDALONE_COURSE, or_(Space.owner_id == user_id, Space.id.in_(member_of)))
        .order_by(Space.created_at.desc())
    )
    return db.scalars(stmt).all()


def list_with_member_status(db: Session, *, user_id: str, member_status: MemberStatus) -> Sequence[Space]:
    """Standalone courses where the user has a row with `member_status` (INVITED: invitations)."""
    stmt = (
        select(Space)
        .join(SpaceMember, SpaceMember.space_id == Space.id)
        .where(*STANDALONE_COURSE, SpaceMember.user_id == user_id, SpaceMember.status == int(member_status))
        .order_by(SpaceMember.created_at.desc())
    )
    return db.scalars(stmt).all()


def _catalog_query(*, search: str | None) -> Select[tuple[Space]]:
    stmt = select(Space).where(
        *STANDALONE_COURSE,
        Space.visibility == int(SpaceVisibility.PUBLIC),
        Space.status == int(SpaceStatus.ACTIVE),
        Space.published_at.is_not(None),
    )
    if search:
        # Tags are JSONB: the text form (`["a", "b"]`) is enough for a containment match.
        stmt = stmt.where(token_search(Space.title, Space.description, cast(Space.tags, String), search=search))
    return stmt


def list_catalog(
    db: Session, *, search: str | None, sort: SpaceCatalogSort, page: int, per_page: int
) -> tuple[Sequence[Space], int]:
    """Public, published, active standalone courses (the catalog)."""
    stmt = _catalog_query(search=search)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = (
        (_active_member_count().desc(), Space.published_at.desc())
        if sort == "members"
        else (Space.published_at.desc(),)
    )
    rows = db.scalars(stmt.order_by(*order, Space.id).offset((page - 1) * per_page).limit(per_page)).all()
    return rows, total


def set_status(db: Session, *, space: Space, status: int, archived_at: datetime | None) -> None:
    space.status = status
    space.archived_at = archived_at
    db.flush()
