from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.constants import FEED_PAGE_SIZE
from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.notification import NotificationPage, UnreadCount
from app.services import notification_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.get("", response_model=NotificationPage)
def list_notifications(
    db: DbSession,
    current_user: CurrentUser,
    unread_only: bool = False,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = FEED_PAGE_SIZE,
) -> NotificationPage:
    """Newest first. Also lazily generates due-soon notifications and purges old read ones.

    See `notification_service` for the generation and purge logic.
    """
    return notification_service.list_for_user(
        db, current_user=current_user, unread_only=unread_only, cursor=cursor, limit=limit
    )


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(db: DbSession, current_user: CurrentUser) -> UnreadCount:
    """Polled by the bell every 30s."""
    return notification_service.unread_count(db, current_user=current_user)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: str, db: DbSession, current_user: CurrentUser) -> None:
    notification_service.mark_read(db, notification_id=notification_id, current_user=current_user)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(db: DbSession, current_user: CurrentUser) -> None:
    notification_service.mark_all_read(db, current_user=current_user)
