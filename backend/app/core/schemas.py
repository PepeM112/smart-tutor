from datetime import datetime, timezone
from enum import IntEnum
from typing import Dict

from pydantic import ConfigDict, GetJsonSchemaHandler
from pydantic.alias_generators import to_camel
from pydantic_core import CoreSchema
from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class BaseSchema:
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


class NamedIntEnum(IntEnum):
    """Ensures TypeScript Enums have names (UNKNOWN = 0) instead of just numbers."""

    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler) -> Dict[str, object]:
        json_schema = handler(core_schema)
        json_schema["x-enum-varnames"] = [e.name for e in cls]
        return json_schema
