from app.core.schemas import NamedIntEnum


class QuestionType(NamedIntEnum):
    UNKNOWN = 0
    SIMPLE = 1
    MULTIPLE_CHOICE = 2
    LONG_TEXT = 3
