from pydantic import Field, ValidationInfo, field_validator, model_validator

from app.core.enums import LongTextLength, QuestionType
from app.schemas.base import BaseSchema

# --- Content sub-models ---


class RubricItem(BaseSchema):
    point: str = Field(..., description="The concept or fact the user must mention")
    weight: float = Field(..., ge=0.0, le=1.0, description="Score contribution (0.0 to 1.0)")
    category: str | None = Field(default=None, description="Optional grouping label (e.g. 'Key Events')")


class SimpleContent(BaseSchema):
    answers: list[str] = Field(..., min_length=1)


class MultipleChoiceContent(BaseSchema):
    options: list[str] = Field(..., min_length=2, max_length=6)
    correct_indices: list[int] = Field(..., min_length=1)

    @field_validator("correct_indices")
    @classmethod
    def validate_correct_indices(cls, v: list[int], info: ValidationInfo) -> list[int]:
        options = info.data.get("options")
        if options is not None:
            for idx in v:
                if idx < 0 or idx >= len(options):
                    raise ValueError(f"correct_indices value {idx} is out of range for {len(options)} options")
        return v


class LongTextContent(BaseSchema):
    length_limit: LongTextLength
    rubric: list[RubricItem] = Field(..., min_length=1)

    @field_validator("rubric")
    @classmethod
    def validate_rubric_weights(cls, v: list[RubricItem]) -> list[RubricItem]:
        for item in v:
            remainder = round(item.weight % 0.05, 10)
            if remainder > 1e-9 and remainder < 0.05 - 1e-9:
                raise ValueError(f"Weight {item.weight} is not a multiple of 0.05")
        total = sum(item.weight for item in v)
        if total <= 0:
            raise ValueError("Sum of rubric weights must be greater than 0")
        return v


QuestionContent = SimpleContent | MultipleChoiceContent | LongTextContent


# --- Stripped content (answer fields optional, used when answers are hidden) ---


class SimpleContentStripped(BaseSchema):
    answers: list[str] | None = None


class MultipleChoiceContentStripped(BaseSchema):
    options: list[str] = Field(..., min_length=2, max_length=6)
    correct_indices: list[int] | None = None


class LongTextContentStripped(BaseSchema):
    length_limit: LongTextLength
    rubric: list[RubricItem] | None = None


StrippedQuestionContent = LongTextContentStripped | MultipleChoiceContentStripped | SimpleContentStripped


def _validate_content(q_type: QuestionType | None, content: QuestionContent) -> None:
    """Validate that the content model matches the question type."""
    if q_type == QuestionType.SIMPLE and not isinstance(content, SimpleContent):
        raise ValueError(f"Invalid content for {q_type}: expected SimpleContent, got {type(content).__name__}")
    if q_type == QuestionType.MULTIPLE_CHOICE and not isinstance(content, MultipleChoiceContent):
        raise ValueError(f"Invalid content for {q_type}: expected MultipleChoiceContent, got {type(content).__name__}")
    if q_type == QuestionType.LONG_TEXT and not isinstance(content, LongTextContent):
        raise ValueError(f"Invalid content for {q_type}: expected LongTextContent, got {type(content).__name__}")


# --- Pydantic Schemas ---


class QuestionBase(BaseSchema):
    question_type: QuestionType
    prompt: str
    content: QuestionContent
    hint: str | None = None
    explanation: str | None = None
    test_id: str | None = None
    group_id: str | None = None
    order: int = 0
    points: float = 1.0

    @field_validator("content")
    @classmethod
    def validate_content_schema(cls, v: QuestionContent, info: ValidationInfo) -> QuestionContent:
        q_type = info.data.get("question_type")
        _validate_content(q_type, v)
        return v


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseSchema):
    question_type: QuestionType | None = None
    prompt: str | None = None
    content: QuestionContent | None = None
    hint: str | None = None
    explanation: str | None = None
    points: float | None = None

    @model_validator(mode="after")
    def validate_content_consistency(self) -> "QuestionUpdate":
        if self.content is not None and self.question_type is not None:
            _validate_content(self.question_type, self.content)
        return self


class QuestionRead(QuestionBase):
    id: str
    origin_id: str | None = None


class QuestionReadStripped(BaseSchema):
    """QuestionRead with answer fields optional — used when answers are stripped before serving."""

    question_type: QuestionType
    prompt: str
    content: StrippedQuestionContent
    hint: str | None = None
    explanation: str | None = None
    test_id: str | None = None
    group_id: str | None = None
    order: int = 0
    points: float = 1.0
    id: str
