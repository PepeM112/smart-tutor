from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.space_comment import SpaceComment


def get(db: Session, *, comment_id: str) -> SpaceComment | None:
    return db.scalars(select(SpaceComment).where(SpaceComment.id == comment_id)).first()


def create(db: Session, *, post_id: str, author_id: str, body: str) -> SpaceComment:
    # Both columns get the same instant: their separate defaults differ by microseconds, and
    # `updated_at > created_at` is what the UI reads as "edited".
    now = datetime.now(timezone.utc)
    comment = SpaceComment(post_id=post_id, author_id=author_id, body=body, created_at=now, updated_at=now)
    db.add(comment)
    db.flush()
    return comment


def update(db: Session, *, comment: SpaceComment, body: str) -> SpaceComment:
    comment.body = body
    db.flush()
    return comment


def delete(db: Session, *, comment: SpaceComment) -> None:
    db.delete(comment)
    db.flush()


def list_for_posts(db: Session, *, post_ids: Sequence[str]) -> Sequence[SpaceComment]:
    """Every comment of any of `post_ids`, oldest first. One query regardless of how many posts (no N+1)."""
    if not post_ids:
        return []
    stmt = select(SpaceComment).where(SpaceComment.post_id.in_(post_ids)).order_by(SpaceComment.id)
    return db.scalars(stmt).all()
