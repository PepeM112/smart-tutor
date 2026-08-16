from collections.abc import Callable
from typing import TypeVar

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User

T = TypeVar("T")


def get_owned_or_404(
    db: Session,
    *,
    fetch: Callable[..., T | None],
    id: str,
    current_user: User,
    entity_name: str,
) -> T:
    """Fetch an entity by ID, verify it exists and belongs to the current user.

    The fetched entity must have a ``user_id`` attribute.
    """
    entity = fetch(db, id=id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity_name} not found")
    if entity.user_id != current_user.id:  # type: ignore[union-attr]
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return entity
