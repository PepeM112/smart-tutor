from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session

from app.crud import space_item_test as space_item_test_crud
from app.models.space_item import SpaceItem


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
    """`test_ids`: the variants of a TEST item, in order. `policy_from`: copy its attempt policy."""
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
    """`{space_id: published items}`."""
    if not space_ids:
        return {}
    stmt = (
        select(SpaceItem.space_id, func.count())
        .where(SpaceItem.space_id.in_(space_ids), SpaceItem.is_draft.is_(False))
        .group_by(SpaceItem.space_id)
    )
    return {space_id: count for space_id, count in db.execute(stmt).all()}
