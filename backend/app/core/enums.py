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
    # Not a test class: stops pytest from collecting it. Dunder names are not enum members.
    __test__ = False

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


# --- Spaces (courses + classrooms). See docs/spaces.md. ---


class SpaceKind(NamedIntEnum):
    COURSE = 1
    CLASSROOM = 2


class SpaceVisibility(NamedIntEnum):
    PRIVATE = 1
    UNLISTED = 2
    PUBLIC = 3


class SpaceStatus(NamedIntEnum):
    ACTIVE = 1
    ARCHIVED = 2


class SpaceRole(NamedIntEnum):
    # OWNER is never stored in space_member: `space.owner_id` is the only owner record.
    OWNER = 1
    EDITOR = 2
    VIEWER = 3


class MemberStatus(NamedIntEnum):
    INVITED = 1
    REQUESTED = 2
    ACTIVE = 3


class SpaceItemKind(NamedIntEnum):
    NOTE = 1
    TEST = 2
    # A course inside a classroom (M4). Only a classroom has COURSE items.
    COURSE = 3


# --- Course progress and attempts (ST-67). See docs/spaces.md. ---


class RevealAnswers(NamedIntEnum):
    """When a student may see the answer key of a course test."""

    ALWAYS = 1
    # After the item is passed, or when no attempt is left.
    AFTER_PASS_OR_LAST = 2
    NEVER = 3


class AttemptStatus(NamedIntEnum):
    OPEN = 1
    SUBMITTED = 2
    # Not submitted before the deadline + grace. It counts as a started attempt.
    EXPIRED = 3


# --- Classrooms (ST-68). See docs/spaces.md. ---


class FeedPermission(NamedIntEnum):
    """What students may do in the classroom stream (M5 uses it)."""

    TEACHERS_ONLY = 1
    STUDENTS_COMMENT = 2
    STUDENTS_POST_AND_COMMENT = 3


class KeyPriority(NamedIntEnum):
    """Which AI key is used first when a student has a key and the classroom has a Class key."""

    STUDENT = 1
    CLASS = 2


class KeyScope(NamedIntEnum):
    """Where the Class key may be used."""

    CLASSROOM_CONTENT = 1
    ALL = 2


class KeySource(NamedIntEnum):
    """Which key paid for an AI call (`token_usage.key_source`). Rows from before ST-68 count as STUDENT."""

    STUDENT = 1
    CLASS = 2


class GradeCellStatus(NamedIntEnum):
    """The state of one student on one test in the gradebook."""

    NOT_STARTED = 1
    # An attempt is open.
    IN_PROGRESS = 2
    # A result still has an answer in grading.
    PENDING = 3
    PASSED = 4
    FAILED = 5


class KeyStatus(NamedIntEnum):
    """Which AI key the current user would use in a classroom (`GET /classrooms/{id}/ai-key-status`)."""

    NONE = 1
    STUDENT = 2
    CLASS = 3


# --- Feed and notifications (ST-69). See docs/spaces.md. ---


class NotificationType(NamedIntEnum):
    """One row per recipient is written per event (`notification_service.notify`)."""

    INVITE_RECEIVED = 1
    JOIN_REQUESTED = 2
    REQUEST_APPROVED = 3
    CONTENT_PUBLISHED = 4
    POST_CREATED = 5
    COMMENT_CREATED = 6
    DUE_SOON = 7
    GRADE_OVERRIDDEN = 8
