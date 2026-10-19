"""CRUD for `notification`. See `app/services/notification_service.py` for the event / recipient rules."""

from collections.abc import Collection, Mapping, Sequence
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, func, select
from sqlalchemy import delete as sql_delete
from sqlalchemy import update as sql_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.notification import Notification


def get(db: Session, *, notification_id: str) -> Notification | None:
    return db.scalars(select(Notification).where(Notification.id == notification_id)).first()


def create_many(db: Session, *, rows: Sequence[Mapping[str, object]]) -> None:
    """Fan-out insert, one row per recipient (`id` and `created_at` use their column defaults).

    `ON CONFLICT (user_id, dedupe_key) DO NOTHING`: Postgres never treats two NULL `dedupe_key`
    values as conflicting, so this is safe to use for every notification, not only the due-soon
    ones that set it. A deliberate exception to "CRUD uses the ORM": `on_conflict_do_nothing` has
    no `db.add_all()` equivalent, and the due-soon dedupe must be race-safe under concurrent requests.
    """
    if not rows:
        return
    stmt = pg_insert(Notification).values(list(rows)).on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"])
    db.execute(stmt)
    db.flush()


def list_dedupe_keys(db: Session, *, user_id: str, keys: Collection[str]) -> set[str]:
    """The subset of `keys` this user already has a notification for."""
    if not keys:
        return set()
    stmt = select(Notification.dedupe_key).where(Notification.user_id == user_id, Notification.dedupe_key.in_(keys))
    return {k for k in db.scalars(stmt).all() if k is not None}


def list_page(
    db: Session, *, user_id: str, unread_only: bool, cursor: str | None, limit: int
) -> Sequence[Notification]:
    """Up to `limit + 1` rows, newest first. The extra row (if present) signals a next page."""
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    if cursor is not None:
        stmt = stmt.where(Notification.id < cursor)
    return db.scalars(stmt.order_by(Notification.id.desc()).limit(limit + 1)).all()


def unread_count(db: Session, *, user_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return db.scalar(stmt) or 0


def mark_read(db: Session, *, notification: Notification, at: datetime) -> None:
    notification.read_at = at
    db.flush()


def mark_all_read(db: Session, *, user_id: str, at: datetime) -> None:
    db.execute(
        sql_update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=at)
    )
    db.flush()


def purge_expired(db: Session, *, user_id: str, before: datetime) -> int:
    """Delete this user's read notifications created before `before` (lazy purge on the list fetch).
    Unread ones are never purged, no matter how old. Returns the number of deleted rows."""
    # A bulk DELETE returns a CursorResult; `Session.execute` is typed as the generic Result.
    result = cast(
        CursorResult[Any],
        db.execute(
            sql_delete(Notification).where(
                Notification.user_id == user_id,
                Notification.read_at.is_not(None),
                Notification.created_at < before,
            )
        ),
    )
    db.flush()
    return result.rowcount
