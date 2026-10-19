from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import ScalarSelect, Select, String, and_, cast, func, or_, select
from sqlalchemy import delete as sql_delete
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus, SpaceKind, SpaceRole, SpaceStatus, SpaceVisibility
from app.crud.helpers import token_search
from app.crud.space_item import visible_course_ids
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.schemas.space import SpaceCatalogSort, SpaceListStatus, SpaceUpdate

# Standalone courses. Classroom courses have a parent and never show in the course lists.
STANDALONE_COURSE = (Space.kind == int(SpaceKind.COURSE), Space.parent_id.is_(None))
# What a user can join: a standalone course or a classroom (a classroom course has no members of its own).
JOINABLE = or_(and_(*STANDALONE_COURSE), Space.kind == int(SpaceKind.CLASSROOM))


def joined_space_ids(*, user_id: str) -> Select[tuple[str]]:
    """The ids of the spaces where `user_id` is an ACTIVE member, and of the visible courses of the
    classrooms where `user_id` is an ACTIVE member. INVITED, REQUESTED and left spaces are not in it.
    The owner has no member row, so the spaces they own are not in it either.

    A lazy row (`role` NULL) is not a membership: the course comes from its classroom row. So the
    access ends when the user leaves the classroom, also when an old lazy row is still there.
    A course whose COURSE item is not published or not visible yet (`visible_from`) is left out.
    """
    member_of = select(SpaceMember.space_id).where(
        SpaceMember.user_id == user_id,
        SpaceMember.status == int(MemberStatus.ACTIVE),
        SpaceMember.role.is_not(None),
    )
    return select(Space.id).where(
        or_(Space.id.in_(member_of), and_(Space.parent_id.in_(member_of), Space.id.in_(visible_course_ids())))
    )


def editor_space_ids(*, user_id: str) -> Select[tuple[str]]:
    """The ids of the spaces where `user_id` is an ACTIVE EDITOR, and of the courses of those classrooms.

    A direct row on a course wins over the classroom role in `access_service.resolve_role`. So an old
    VIEWER row on a course keeps the user a VIEWER there, even after they became a co-teacher of the
    classroom. This list does not know that rule: it is a coarse filter, the access check decides.
    """
    editor_of = select(SpaceMember.space_id).where(
        SpaceMember.user_id == user_id,
        SpaceMember.status == int(MemberStatus.ACTIVE),
        SpaceMember.role == int(SpaceRole.EDITOR),
    )
    return select(Space.id).where(or_(Space.id.in_(editor_of), Space.parent_id.in_(editor_of)))


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
    """A standalone course or a classroom. A classroom course has a code too, but it is not joinable."""
    stmt = select(Space).where(Space.join_code == code, JOINABLE)
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
    join_code: str | None,
    draft_started_at: datetime | None,
    parent_id: str | None = None,
) -> Space:
    space = Space(
        kind=kind,
        parent_id=parent_id,
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
    """ACTIVE members per space. Lazy rows (`role` NULL) are not members, so they are not counted."""
    if not space_ids:
        return {}
    stmt = (
        select(SpaceMember.space_id, func.count())
        .where(
            SpaceMember.space_id.in_(space_ids),
            SpaceMember.status == int(MemberStatus.ACTIVE),
            SpaceMember.role.is_not(None),
        )
        .group_by(SpaceMember.space_id)
    )
    return {space_id: count for space_id, count in db.execute(stmt).all()}


def list_for_user(
    db: Session,
    *,
    user_id: str,
    status: SpaceListStatus = "all",
    visibility: Sequence[SpaceVisibility] = (),
    roles: Sequence[SpaceRole] = (),
    classrooms: bool = False,
) -> Sequence[Space]:
    """Standalone courses (or the classrooms) the user owns or is an ACTIVE member of. Newest first.

    `roles` filters on the role of the user: OWNER = `owner_id`, EDITOR / VIEWER = the member row.
    """
    member_roles = [int(r) for r in roles if r != SpaceRole.OWNER]
    member_of = select(SpaceMember.space_id).where(
        SpaceMember.user_id == user_id, SpaceMember.status == int(MemberStatus.ACTIVE)
    )
    owned = Space.owner_id == user_id
    if roles:
        role_filters = [owned] if SpaceRole.OWNER in roles else []
        if member_roles:
            role_filters.append(Space.id.in_(member_of.where(SpaceMember.role.in_(member_roles))))
        access = or_(*role_filters)
    else:
        access = or_(owned, Space.id.in_(member_of))
    kind_filter = Space.kind == int(SpaceKind.CLASSROOM) if classrooms else and_(*STANDALONE_COURSE)
    stmt = select(Space).where(kind_filter, access)
    if status != "all":
        archived = int(SpaceStatus.ARCHIVED)
        stmt = stmt.where(Space.status == archived if status == "archived" else Space.status != archived)
    if visibility:
        stmt = stmt.where(Space.visibility.in_([int(v) for v in visibility]))
    return db.scalars(stmt.order_by(Space.created_at.desc())).all()


def list_with_member_status(db: Session, *, user_id: str, member_status: MemberStatus) -> Sequence[Space]:
    """Standalone courses and classrooms where the user has a row with `member_status` (INVITED: invitations)."""
    stmt = (
        select(Space)
        .join(SpaceMember, SpaceMember.space_id == Space.id)
        .where(JOINABLE, SpaceMember.user_id == user_id, SpaceMember.status == int(member_status))
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


def list_children(db: Session, *, parent_id: str) -> Sequence[Space]:
    """The courses of a classroom. Oldest first."""
    stmt = select(Space).where(Space.parent_id == parent_id).order_by(Space.created_at, Space.id)
    return db.scalars(stmt).all()


def list_children_for_parents(db: Session, *, parent_ids: Sequence[str]) -> Sequence[Space]:
    """The courses of any number of classrooms, in one query (the due-soon notification scan)."""
    if not parent_ids:
        return []
    stmt = select(Space).where(Space.parent_id.in_(parent_ids)).order_by(Space.created_at, Space.id)
    return db.scalars(stmt).all()


def list_by_ids(db: Session, *, ids: Sequence[str]) -> Sequence[Space]:
    if not ids:
        return []
    return db.scalars(select(Space).where(Space.id.in_(ids))).all()


def list_orphan_children(db: Session, *, parent_id: str, linked_ids: Sequence[str]) -> Sequence[Space]:
    """The courses of a classroom that no COURSE item points to (draft or published)."""
    stmt = select(Space).where(Space.parent_id == parent_id)
    if linked_ids:
        stmt = stmt.where(Space.id.not_in(linked_ids))
    return db.scalars(stmt).all()
