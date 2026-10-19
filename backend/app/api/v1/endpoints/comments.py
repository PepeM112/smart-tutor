from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.space_feed import SpaceCommentRead, SpaceCommentUpdate
from app.services import space_feed_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.patch("/{comment_id}", response_model=SpaceCommentRead)
def update_comment(
    comment_id: str, data: SpaceCommentUpdate, db: DbSession, current_user: CurrentUser
) -> SpaceCommentRead:
    """The author only."""
    return space_feed_service.update_comment(db, comment_id=comment_id, current_user=current_user, data=data)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: str, db: DbSession, current_user: CurrentUser) -> None:
    """The author, or a teacher of the classroom (moderation)."""
    space_feed_service.delete_comment(db, comment_id=comment_id, current_user=current_user)
