from enum import Enum

from pydantic import GetJsonSchemaHandler
from pydantic_core import CoreSchema


class NamedIntEnum(int, Enum):
    """Int-backed enum whose member names are emitted in the OpenAPI schema."""

    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler) -> dict[str, object]:
        json_schema = handler(core_schema)
        json_schema["x-enum-varnames"] = [e.name for e in cls]
        return json_schema


class UserStatus(NamedIntEnum):
    ACTIVE = 1
    DELETED = 2
    BLOCKED = 3


class UserRole(NamedIntEnum):
    ADMIN = 1
    USER = 2


class TestStatus(NamedIntEnum):
    ACTIVE = 1
    DELETED = 2


class QuestionStatus(NamedIntEnum):
    ACTIVE = 1
    DELETED = 2


class GroupStatus(NamedIntEnum):
    ACTIVE = 1
    DELETED = 2


class QuestionType(NamedIntEnum):
    SIMPLE = 1
    MULTIPLE_CHOICE = 2
    LONG_TEXT = 3


class AnswerStatus(NamedIntEnum):
    CORRECT = 1
    WRONG = 2
    PARTIAL = 3
    PENDING = 4
    FAILED = 5


class LongTextLength(NamedIntEnum):
    SHORT = 1
    MEDIUM = 2
    LONG = 3


LONG_TEXT_CHAR_LIMITS: dict[int, int] = {
    LongTextLength.SHORT: 500,
    LongTextLength.MEDIUM: 1800,
    LongTextLength.LONG: 5000,
}


class QuestionGroupType(NamedIntEnum):
    GENERIC = 1
    VOCABULARY = 2


class NoteSource(NamedIntEnum):
    USER_CREATED = 1
    AI_GENERATED = 2


class NoteLength(NamedIntEnum):
    SHORT = 1
    MEDIUM = 2
    LONG = 3


class AIProvider(NamedIntEnum):
    ANTHROPIC = 1
    OPENAI = 2


class AIFeature(NamedIntEnum):
    GRADING = 1
    CHALLENGE = 2
    NOTE_GENERATION = 3
    NOTE_REFINEMENT = 4
    NOTE_CHUNK_EDIT = 5
    TEST_GENERATION = 6
    ASSIST = 7
    EMBEDDING = 8
