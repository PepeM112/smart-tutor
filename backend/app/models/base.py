from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column
from ulid import ULID


def generate_ulid() -> str:
    """Generate a new ULID string for use as a primary key default."""
    return str(ULID())


class CreatedAtMixin:
    """SQLAlchemy mixin that adds a created_at column to any ORM model."""

    @declared_attr
    def created_at(cls) -> Mapped[datetime]:  # noqa: N805
        return mapped_column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
            default=lambda: datetime.now(timezone.utc),
        )
