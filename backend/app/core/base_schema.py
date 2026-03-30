from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class BaseSchema(BaseModel):
    """
    Ensures Python snake_case becomes Frontend camelCase.
    Also allows reading from SQLAlchemy ORM objects (from_attributes).
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


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

