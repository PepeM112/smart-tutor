"""Notifications (ST-69 M5): fan-out-on-write, typed rows with a JSON payload. See docs/spaces.md.

`notify()` is called by the services that cause an event (`space_member_service`, `space_draft_service`,
`grade_override_service`, `space_feed_service`) at the point the event becomes real, before their own
`db.commit()` -- the notification rows ride the same transaction, so they never appear for a write that
then rolls back. `Channel` is the delivery abstraction: only `InAppChannel` exists today, but an email or
push channel plugs into `_CHANNELS` with no change to the callers of `notify()`.

Due-soon is different: nothing "happens" to trigger it, so it is generated lazily, on every bell fetch
(`list_for_user` and `unread_count`), scanning every classroom the user is a student in. The lazy 90-day
purge of read notifications (unread ones are never purged) runs only in `list_for_user`, following the
`trash_service._purge_expired` pattern: the 30 s count poll stays cheap.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.constants import FEED_PAGE_SIZE, NOTIFICATION_RETENTION_DAYS
from app.core.enums import NotificationType, SpaceItemKind, SpaceRole
from app.crud import notification as notification_crud
from app.crud import space as space_crud
from app.models.notification import Notification
from app.models.space import Space
from app.models.user import User
from app.schemas.notification import (
    DueSoonPayload,
    NotificationPage,
    NotificationPayload,
    NotificationRead,
    UnreadCount,
)
from app.services import due_soon_service
from app.services.access_service import resolve_role

logger = logging.getLogger("smarttutor.notifications")


def actor_name(user: User) -> str:
    """The name shown in another user's notification: the display name, or the username if unset."""
    return user.display_name or user.username


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


# ── Delivery ────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _PendingNotification:
    user_id: str
    notification_type: NotificationType
    payload: dict[str, object]
    space_id: str | None
    actor_id: str | None
    dedupe_key: str | None


class Channel(ABC):
    """A way to deliver a batch of already-built notifications."""

    @abstractmethod
    def send(self, db: Session, notifications: Iterable[_PendingNotification]) -> None: ...


class InAppChannel(Channel):
    """Writes the bell / `/notifications` rows. The only channel today."""

    def send(self, db: Session, notifications: Iterable[_PendingNotification]) -> None:
        rows = [
            {
                "user_id": n.user_id,
                "type": int(n.notification_type),
                "payload": n.payload,
                "space_id": n.space_id,
                "actor_id": n.actor_id,
                "dedupe_key": n.dedupe_key,
            }
            for n in notifications
        ]
        notification_crud.create_many(db, rows=rows)


_CHANNELS: list[Channel] = [InAppChannel()]


def notify(
    db: Session,
    *,
    notification_type: NotificationType,
    recipients: Iterable[str],
    payload: NotificationPayload,
    actor_id: str | None = None,
    space_id: str | None = None,
    dedupe_key: str | None = None,
) -> None:
    """Write one notification row per recipient (deduplicated), never for the actor even if also a recipient.

    `payload` is one of the typed models in `app.schemas.notification`. It is stored as plain JSON
    (`mode="json"`, snake_case field names) and read back through the same discriminated union in
    `NotificationRead`. Does not commit -- the caller commits as part of its own write.
    """
    body = payload.model_dump(mode="json")
    user_ids = {r for r in recipients if r != actor_id}
    if not user_ids:
        return
    pending = [
        _PendingNotification(
            user_id=user_id,
            notification_type=notification_type,
            payload=body,
            space_id=space_id,
            actor_id=actor_id,
            dedupe_key=dedupe_key,
        )
        for user_id in user_ids
    ]
    for channel in _CHANNELS:
        channel.send(db, pending)


def with_space_access(db: Session, *, space: Space, user_ids: Iterable[str]) -> set[str]:
    """The users that can still reach `space` (owner or ACTIVE member, classroom roles included).

    Events about something that already happened to a user (a new comment, a grade override) use this
    to skip a recipient who was removed or left. Not for INVITE_RECEIVED (the user is INVITED, not active)
    nor for the join-request events, which are about people who are not members yet.
    """
    return {user_id for user_id in user_ids if resolve_role(db, space=space, user_id=user_id) is not None}


# ── Lazy generation + purge (run on every bell fetch) ────────────────────────────


def _generate_due_soon(db: Session, *, user_id: str) -> None:
    """One DUE_SOON notification per (user, item) due in the next 24h, across every classroom the user studies in.

    Same filters as `classroom_service.due_soon` (both call `due_soon_service.pending_due_items`), but scanning all
    of the user's classrooms at once (`pending_due_items` takes a list). The user's existing `due:*` keys are read
    first, so a bell poll with nothing new writes nothing and does not commit. `dedupe_key = "due:<item_id>"` +
    `UNIQUE(user_id, dedupe_key)` still covers the race: two concurrent fetches that both see a key as missing
    produce one row, because the second insert is a silent no-op (`ON CONFLICT DO NOTHING`), never a duplicate
    row or an error.
    """
    classrooms = space_crud.list_for_user(
        db, user_id=user_id, status="active", roles=[SpaceRole.VIEWER], classrooms=True
    )
    if not classrooms:
        return
    start = datetime.now(timezone.utc)
    end = start + due_soon_service.DUE_SOON_WINDOW
    pending = due_soon_service.pending_due_items(db, classrooms=classrooms, user_id=user_id, start=start, end=end)
    existing = notification_crud.list_dedupe_keys(db, user_id=user_id, keys=[f"due:{p.item.id}" for p in pending])
    missing = [p for p in pending if f"due:{p.item.id}" not in existing]
    if not missing:
        return
    for p in missing:
        notify(
            db,
            notification_type=NotificationType.DUE_SOON,
            recipients=[user_id],
            space_id=p.space.id,
            payload=DueSoonPayload(
                item_id=p.item.id,
                item_title=p.title,
                item_kind=SpaceItemKind(p.item.kind),
                space_id=p.space.id,
                space_title=p.space.title,
                classroom_id=p.classroom_id,
                due_at=p.due_at,
            ),
            dedupe_key=f"due:{p.item.id}",
        )
    db.commit()


def _purge_expired(db: Session, *, user_id: str) -> None:
    """Delete this user's read notifications older than `NOTIFICATION_RETENTION_DAYS`. Unread ones are kept.

    Commits only when a row was deleted.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=NOTIFICATION_RETENTION_DAYS)
    if notification_crud.purge_expired(db, user_id=user_id, before=cutoff) > 0:
        db.commit()


# ── Reads ─────────────────────────────────────────────────────────────────────


def _read_or_none(row: Notification) -> NotificationRead | None:
    """A row whose stored payload no longer validates (old shape, bad data) is skipped, not a 500 for the bell."""
    try:
        return NotificationRead.model_validate(row)
    except ValidationError:
        logger.warning("Skipping notification %s: its payload no longer validates", row.id)
        return None


def list_for_user(
    db: Session, *, current_user: User, unread_only: bool, cursor: str | None, limit: int = FEED_PAGE_SIZE
) -> NotificationPage:
    # Read the id once: a commit below expires `current_user`, and each later `.id` would reload the row.
    user_id = current_user.id
    _generate_due_soon(db, user_id=user_id)
    _purge_expired(db, user_id=user_id)
    rows = notification_crud.list_page(db, user_id=user_id, unread_only=unread_only, cursor=cursor, limit=limit)
    page = rows[:limit]
    # The cursor is the last item ON the page, not the lookahead row: `WHERE id < cursor` must not skip it.
    next_cursor = page[-1].id if len(rows) > limit else None
    items = [item for item in (_read_or_none(r) for r in page) if item is not None]
    return NotificationPage(items=items, next_cursor=next_cursor)


def unread_count(db: Session, *, current_user: User) -> UnreadCount:
    user_id = current_user.id
    _generate_due_soon(db, user_id=user_id)
    return UnreadCount(count=notification_crud.unread_count(db, user_id=user_id))


# ── Writes ────────────────────────────────────────────────────────────────────


def mark_read(db: Session, *, notification_id: str, current_user: User) -> None:
    notification = notification_crud.get(db, notification_id=notification_id)
    if notification is None or notification.user_id != current_user.id:
        raise _not_found("Notification not found")
    notification_crud.mark_read(db, notification=notification, at=datetime.now(timezone.utc))
    db.commit()


def mark_all_read(db: Session, *, current_user: User) -> None:
    notification_crud.mark_all_read(db, user_id=current_user.id, at=datetime.now(timezone.utc))
    db.commit()
