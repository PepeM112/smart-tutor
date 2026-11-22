from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.error import coded_errors
from app.schemas.space_feed import SpaceCommentCreate, SpaceCommentRead, SpacePostRead, SpacePostUpdate
from app.services import space_feed_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.patch("/{post_id}", response_model=SpacePostRead, responses=coded_errors(403, 404, 409))
def update_post(post_id: str, data: SpacePostUpdate, db: DbSession, current_user: CurrentUser) -> SpacePostRead:
    """The author only."""
    return space_feed_service.update_post(db, post_id=post_id, current_user=current_user, data=data)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT, responses=coded_errors(403, 404, 409))
def delete_post(post_id: str, db: DbSession, current_user: CurrentUser) -> None:
    """The author, or a teacher of the classroom (moderation)."""
    space_feed_service.delete_post(db, post_id=post_id, current_user=current_user)


@router.post(
    "/{post_id}/comments",
    response_model=SpaceCommentRead,
    status_code=status.HTTP_201_CREATED,
    responses=coded_errors(403, 404, 409),
)
def create_comment(
    post_id: str, data: SpaceCommentCreate, db: DbSession, current_user: CurrentUser
) -> SpaceCommentRead:
    return space_feed_service.create_comment(db, post_id=post_id, current_user=current_user, data=data)
