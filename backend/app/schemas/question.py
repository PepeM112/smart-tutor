from typing import List, Optional

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator

from app.core.enums import QuestionType
from app.schemas.base import BaseSchema

# --- Content sub-models ---


class RubricItem(BaseModel):
    point: str = Field(..., description="The concept or fact the user must mention")
    weight: float = Field(..., ge=0.0, le=1.0, description="Score contribution (0.0 to 1.0)")


class SimpleContent(BaseModel):
    answers: List[str]


class MultipleChoiceContent(BaseModel):
    options: List[str] = Field(..., min_length=2, max_length=6)
    correct_indices: List[int]


class LongTextContent(BaseModel):
    rubric: List[RubricItem]


def _validate_content(q_type: Optional[QuestionType], content: dict[str, object]) -> None:
    """Validate content shape against the question type."""
    try:
        if q_type == QuestionType.SIMPLE:
            SimpleContent.model_validate(content)
        elif q_type == QuestionType.MULTIPLE_CHOICE:
            MultipleChoiceContent.model_validate(content)
        elif q_type == QuestionType.LONG_TEXT:
            LongTextContent.model_validate(content)
    except Exception as e:
        raise ValueError(f"Invalid content for {q_type}: {str(e)}") from e


# --- Pydantic Schemas ---


class QuestionBase(BaseSchema):
    question_type: QuestionType
    prompt: str
    content: dict[str, object] = {}
    hint: Optional[str] = None
    explanation: Optional[str] = None
    test_id: Optional[str] = None
    group_id: Optional[str] = None
    order: int = 0

    @field_validator("content")
    @classmethod
    def validate_content_schema(cls, v: dict[str, object], info: ValidationInfo) -> dict[str, object]:
        q_type = info.data.get("question_type")
        _validate_content(q_type, v)
        return v


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseSchema):
    question_type: Optional[QuestionType] = None
    prompt: Optional[str] = None
    content: Optional[dict[str, object]] = None
    hint: Optional[str] = None
    explanation: Optional[str] = None

    @model_validator(mode="after")
    def validate_content_consistency(self) -> "QuestionUpdate":
        if self.content is not None and self.question_type is not None:
            _validate_content(self.question_type, self.content)
        return self


class QuestionRead(QuestionBase):
    id: str


class QuestionReadStripped(BaseSchema):
    """QuestionRead without content validation — used when answer data is stripped."""

    question_type: QuestionType
    prompt: str
    content: dict[str, object] = {}
    hint: Optional[str] = None
    explanation: Optional[str] = None
    test_id: Optional[str] = None
    group_id: Optional[str] = None
    order: int = 0
    id: str
