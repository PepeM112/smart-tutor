from datetime import datetime, timezone
from enum import IntEnum
from typing import Dict

from pydantic import ConfigDict, GetJsonSchemaHandler
from pydantic.alias_generators import to_camel
from pydantic_core import CoreSchema
from sqlmodel import Column, DateTime, Field, SQLModel, func


class BaseSchema:
    """
    Ensures Python snake_case becomes Frontend camelCase.
    Also allows reading from SQLModel objects (from_attributes).
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class CreatedAtMixin(SQLModel):
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class NamedIntEnum(IntEnum):
    """Ensures TypeScript Enums have names (UNKNOWN = 0) instead of just numbers."""

    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler) -> Dict[str, object]:
        json_schema = handler(core_schema)
        json_schema["x-enum-varnames"] = [e.name for e in cls]
        return json_schema
