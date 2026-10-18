from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.space_item import SpaceItem
from app.models.space_item_completion import SpaceItemCompletion


def add(db: Session, *, item_id: str, user_id: str, completed_at: datetime) -> None:
    """Idempotent: a second call keeps the first row (and its time)."""
    stmt = (
        pg_insert(SpaceItemCompletion)
        .values(item_id=item_id, user_id=user_id, completed_at=completed_at)
        .on_conflict_do_nothing()
    )
    db.execute(stmt)
    db.flush()


def remove(db: Session, *, item_id: str, user_id: str) -> None:
    db.execute(
        sql_delete(SpaceItemCompletion).where(
            SpaceItemCompletion.item_id == item_id, SpaceItemCompletion.user_id == user_id
        )
    )
    db.flush()


def remove_for_items(db: Session, *, item_ids: Sequence[str]) -> None:
    """Delete the rows of every user for these items (a publish with `reset_item_ids`)."""
    if item_ids:
        db.execute(sql_delete(SpaceItemCompletion).where(SpaceItemCompletion.item_id.in_(item_ids)))
        db.flush()


def list_completed_ids(db: Session, *, user_id: str, item_ids: Sequence[str]) -> set[str]:
    if not item_ids:
        return set()
    stmt = select(SpaceItemCompletion.item_id).where(
        SpaceItemCompletion.user_id == user_id, SpaceItemCompletion.item_id.in_(item_ids)
    )
    return set(db.scalars(stmt).all())


def count_by_space(db: Session, *, user_id: str, space_ids: Sequence[str]) -> dict[str, int]:
    """`{space_id: done published items}` of the user."""
    if not space_ids:
        return {}
    stmt = (
        select(SpaceItem.space_id, func.count())
        .join(SpaceItemCompletion, SpaceItemCompletion.item_id == SpaceItem.id)
        .where(
            SpaceItemCompletion.user_id == user_id,
            SpaceItem.space_id.in_(space_ids),
            SpaceItem.is_draft.is_(False),
        )
        .group_by(SpaceItem.space_id)
    )
    return {space_id: count for space_id, count in db.execute(stmt).all()}


def list_users_done_all(db: Session, *, space_id: str, total_items: int) -> list[str]:
    """Users with a row for every published item of the space (`total_items` > 0)."""
    stmt = (
        select(SpaceItemCompletion.user_id)
        .join(SpaceItem, SpaceItem.id == SpaceItemCompletion.item_id)
        .where(SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(False))
        .group_by(SpaceItemCompletion.user_id)
        .having(func.count() >= total_items)
    )
    return list(db.scalars(stmt).all())
