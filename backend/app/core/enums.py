from enum import Enum

from pydantic import GetJsonSchemaHandler
from pydantic_core import CoreSchema


class NamedIntEnum(int, Enum):
    """Ensures TypeScript Enums have names (UNKNOWN = 0) instead of just numbers."""

    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler) -> dict[str, object]:
        json_schema = handler(core_schema)
        json_schema["x-enum-varnames"] = [e.name for e in cls]
        return json_schema


class UserStatus(NamedIntEnum):
    UNKNOWN = 0
    ACTIVE = 1
    DELETED = 2
    BLOCKED = 3


class TestStatus(NamedIntEnum):
    UNKNOWN = 0
    ACTIVE = 1
    DELETED = 2


class QuestionType(NamedIntEnum):
    UNKNOWN = 0
    SIMPLE = 1
    MULTIPLE_CHOICE = 2
    LONG_TEXT = 3


class AnswerStatus(NamedIntEnum):
    UNKNOWN = 0
    CORRECT = 1
    WRONG = 2
    PARTIAL = 3
    PENDING = 4
    FAILED = 5


class LongTextLength(NamedIntEnum):
    UNKNOWN = 0
    SHORT = 1
    MEDIUM = 2
    LONG = 3


LONG_TEXT_CHAR_LIMITS: dict[int, int] = {
    LongTextLength.SHORT: 500,
    LongTextLength.MEDIUM: 1800,
    LongTextLength.LONG: 5000,
}


class QuestionGroupType(NamedIntEnum):
    UNKNOWN = 0
    VOCABULARY = 1


class NoteSource(NamedIntEnum):
    UNKNOWN = 0
    USER_CREATED = 1
    AI_GENERATED = 2


class NoteLength(NamedIntEnum):
    UNKNOWN = 0
    SHORT = 1
    MEDIUM = 2
    LONG = 3
