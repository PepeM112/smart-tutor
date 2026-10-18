from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy import delete as sql_delete
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session

from app.core.enums import SpaceItemKind
from app.crud import space_item_test as space_item_test_crud
from app.models.space_item import SpaceItem
from app.models.space_item_test import SpaceItemTest
from app.models.space_section import SpaceSection

# A published item that students can not see yet: `visible_from` is in the future.
_HIDDEN = and_(SpaceItem.is_draft.is_(False), SpaceItem.visible_from.is_not(None), SpaceItem.visible_from > func.now())


def countable_item() -> ColumnElement[bool]:
    """A published item that counts for the progress of a student: it is visible, and not a COURSE item.

    A COURSE item has no completion of its own: the course has its own progress.
    """
    return and_(
        SpaceItem.is_draft.is_(False),
        SpaceItem.kind != int(SpaceItemKind.COURSE),
        or_(SpaceItem.visible_from.is_(None), SpaceItem.visible_from <= func.now()),
    )


def hidden_note_ids() -> Select[tuple[str | None]]:
    """Ids of the notes of published items that are not visible yet."""
    return select(SpaceItem.note_id).where(_HIDDEN, SpaceItem.note_id.is_not(None))


def hidden_test_ids() -> Select[tuple[str]]:
    """Ids of the tests (variants) of published items that are not visible yet."""
    return select(SpaceItemTest.test_id).join(SpaceItem, SpaceItem.id == SpaceItemTest.item_id).where(_HIDDEN)


def visible_course_ids() -> Select[tuple[str | None]]:
    """Ids of the courses with a published COURSE item that students can see.

    A course with only a draft item (not published yet), or with a future `visible_from`, is not in it.
    """
    return select(SpaceItem.child_space_id).where(
        SpaceItem.is_draft.is_(False),
        SpaceItem.child_space_id.is_not(None),
        or_(SpaceItem.visible_from.is_(None), SpaceItem.visible_from <= func.now()),
    )


def is_course_hidden(db: Session, *, course_id: str) -> bool:
    """True when students of the classroom can not see the course yet."""
    return db.scalar(visible_course_ids().where(SpaceItem.child_space_id == course_id).limit(1)) is None


def is_note_hidden(db: Session, *, note_id: str) -> bool:
    return db.execute(hidden_note_ids().where(SpaceItem.note_id == note_id).limit(1)).first() is not None


def is_test_hidden(db: Session, *, test_id: str) -> bool:
    return db.execute(hidden_test_ids().where(SpaceItemTest.test_id == test_id).limit(1)).first() is not None


def list_course_items(db: Session, *, space_id: str) -> Sequence[SpaceItem]:
    """The COURSE items of a classroom, draft and published."""
    stmt = select(SpaceItem).where(SpaceItem.space_id == space_id, SpaceItem.kind == int(SpaceItemKind.COURSE))
    return db.scalars(stmt).all()


def list_due(db: Session, *, space_ids: Sequence[str], start: datetime, end: datetime) -> Sequence[SpaceItem]:
    """Published items of the spaces with `start < due_at <= end` that students can see, soonest first."""
    if not space_ids:
        return []
    stmt = (
        select(SpaceItem)
        .where(
            SpaceItem.space_id.in_(space_ids),
            SpaceItem.is_draft.is_(False),
            SpaceItem.due_at.is_not(None),
            SpaceItem.due_at > start,
            SpaceItem.due_at <= end,
            or_(SpaceItem.visible_from.is_(None), SpaceItem.visible_from <= start),
        )
        .order_by(SpaceItem.due_at, SpaceItem.id)
    )
    return db.scalars(stmt).all()


def list_by_space(db: Session, *, space_id: str, is_draft: bool) -> Sequence[SpaceItem]:
    stmt = (
        select(SpaceItem)
        .where(SpaceItem.space_id == space_id, SpaceItem.is_draft == is_draft)
        .order_by(SpaceItem.position, SpaceItem.id)
    )
    return db.scalars(stmt).all()


def get_draft(db: Session, *, space_id: str, item_id: str) -> SpaceItem | None:
    stmt = select(SpaceItem).where(
        SpaceItem.id == item_id, SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(True)
    )
    return db.scalars(stmt).first()


def next_position(db: Session, *, section_id: str) -> int:
    current = db.scalar(select(func.max(SpaceItem.position)).where(SpaceItem.section_id == section_id))
    return 0 if current is None else current + 1


def create(
    db: Session,
    *,
    space_id: str,
    section_id: str,
    kind: int,
    position: int,
    is_draft: bool,
    note_id: str | None = None,
    test_ids: Sequence[str] = (),
    child_space_id: str | None = None,
    draft_of_id: str | None = None,
    policy_from: SpaceItem | None = None,
) -> SpaceItem:
    """`test_ids`: the variants of a TEST item, in order. `policy_from`: copy its attempt policy and schedule."""
    item = SpaceItem(
        space_id=space_id,
        section_id=section_id,
        kind=kind,
        note_id=note_id,
        child_space_id=child_space_id,
        position=position,
        is_draft=is_draft,
        draft_of_id=draft_of_id,
    )
    if policy_from is not None:
        copy_policy(source=policy_from, target=item)
    db.add(item)
    db.flush()
    if test_ids:
        space_item_test_crud.replace(db, item_id=item.id, test_ids=test_ids)
    return item


def copy_policy(*, source: SpaceItem, target: SpaceItem) -> None:
    target.pass_threshold = source.pass_threshold
    target.max_attempts = source.max_attempts
    target.cooldown_hours = source.cooldown_hours
    target.reveal_answers = source.reveal_answers
    target.time_limit_minutes = source.time_limit_minutes
    target.due_at = source.due_at
    target.opens_at = source.opens_at
    target.closes_at = source.closes_at
    target.visible_from = source.visible_from


def set_progress_reset(db: Session, *, item_ids: Sequence[str], at: datetime) -> None:
    """Mark the items as reset at `at` (a publish with `reset_item_ids`)."""
    if item_ids:
        db.execute(sql_update(SpaceItem).where(SpaceItem.id.in_(item_ids)).values(progress_reset_at=at))
        db.flush()


def get(db: Session, *, item_id: str) -> SpaceItem | None:
    return db.get(SpaceItem, item_id)


def delete(db: Session, *, item: SpaceItem) -> None:
    db.execute(sql_delete(SpaceItem).where(SpaceItem.id == item.id))
    db.flush()


def delete_by_ids(db: Session, *, ids: Sequence[str]) -> None:
    if ids:
        db.execute(sql_delete(SpaceItem).where(SpaceItem.id.in_(ids)))
        db.flush()


def count_published_by_space(db: Session, *, space_ids: Sequence[str]) -> dict[str, int]:
    """`{space_id: published items that count for the progress}` (visible, no COURSE items)."""
    if not space_ids:
        return {}
    stmt = (
        select(SpaceItem.space_id, func.count())
        .where(SpaceItem.space_id.in_(space_ids), countable_item())
        .group_by(SpaceItem.space_id)
    )
    return {space_id: count for space_id, count in db.execute(stmt).all()}


def list_published_tests(db: Session, *, space_ids: Sequence[str]) -> Sequence[SpaceItem]:
    """The published TEST items of these spaces, in classwork order (space, section, position).

    Hidden items (`visible_from` in the future) are included: the gradebook is for teachers.
    """
    if not space_ids:
        return []
    stmt = (
        select(SpaceItem)
        .join(SpaceSection, SpaceSection.id == SpaceItem.section_id)
        .where(
            SpaceItem.space_id.in_(space_ids),
            SpaceItem.is_draft.is_(False),
            SpaceItem.kind == int(SpaceItemKind.TEST),
        )
        .order_by(SpaceItem.space_id, SpaceSection.position, SpaceItem.position, SpaceItem.id)
    )
    return db.scalars(stmt).all()


def list_published_course_items(db: Session, *, space_id: str) -> Sequence[SpaceItem]:
    """The published COURSE items of a classroom, in classwork order."""
    stmt = (
        select(SpaceItem)
        .join(SpaceSection, SpaceSection.id == SpaceItem.section_id)
        .where(
            SpaceItem.space_id == space_id,
            SpaceItem.is_draft.is_(False),
            SpaceItem.kind == int(SpaceItemKind.COURSE),
        )
        .order_by(SpaceSection.position, SpaceItem.position, SpaceItem.id)
    )
    return db.scalars(stmt).all()
