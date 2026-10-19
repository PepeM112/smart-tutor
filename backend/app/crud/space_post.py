from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.space_post import SpacePost


def get(db: Session, *, post_id: str) -> SpacePost | None:
    return db.scalars(select(SpacePost).where(SpacePost.id == post_id)).first()


def create(db: Session, *, space_id: str, author_id: str, body: str) -> SpacePost:
    # Both columns get the same instant: their separate defaults differ by microseconds, and
    # `updated_at > created_at` is what the UI reads as "edited".
    now = datetime.now(timezone.utc)
    post = SpacePost(space_id=space_id, author_id=author_id, body=body, created_at=now, updated_at=now)
    db.add(post)
    db.flush()
    return post


def update(db: Session, *, post: SpacePost, body: str) -> SpacePost:
    post.body = body
    db.flush()
    return post


def delete(db: Session, *, post: SpacePost) -> None:
    db.delete(post)
    db.flush()


def list_page(db: Session, *, space_id: str, cursor: str | None, limit: int) -> Sequence[SpacePost]:
    """Up to `limit + 1` posts of a space, newest first (the id, a ULID, sorts by creation time).

    The caller trims to `limit` and uses the extra row (if present) to know there is a next page,
    with no separate COUNT query.
    """
    stmt = select(SpacePost).where(SpacePost.space_id == space_id)
    if cursor is not None:
        stmt = stmt.where(SpacePost.id < cursor)
    return db.scalars(stmt.order_by(SpacePost.id.desc()).limit(limit + 1)).all()
