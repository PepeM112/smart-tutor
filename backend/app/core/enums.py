from enum import IntEnum
from typing import Dict

from pydantic import GetJsonSchemaHandler
from pydantic_core import CoreSchema


class NamedIntEnum(IntEnum):
    """Ensures TypeScript Enums have names (UNKNOWN = 0) instead of just numbers."""

    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler) -> Dict[str, object]:
        json_schema = handler(core_schema)
        json_schema["x-enum-varnames"] = [e.name for e in cls]
        return json_schema


class UserStatus(NamedIntEnum):
    UNKNOWN = 0
    ACTIVE = 1
    DELETED = 2
    BLOCKED = 3


class QuestionType(NamedIntEnum):
    UNKNOWN = 0
    SIMPLE = 1
    MULTIPLE_CHOICE = 2
    LONG_TEXT = 3
