from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, ValidationInfo

from app.core.base_schema import BaseSchema
from app.core.enums import QuestionType


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


# --- Pydantic Schemas ---


class QuestionBase(BaseSchema):
    question_type: QuestionType = QuestionType.SIMPLE
    prompt: str
    content: Dict[str, Any] = {}
    hint: Optional[str] = None
    explanation: Optional[str] = None
    test_id: UUID

    @field_validator("content")
    @classmethod
    def validate_content_schema(cls, v: Dict[str, Any], info: ValidationInfo) -> Dict[str, Any]:
        q_type = info.data.get("question_type")

        try:
            if q_type == QuestionType.SIMPLE:
                SimpleContent(**v)
            elif q_type == QuestionType.MULTIPLE_CHOICE:
                MultipleChoiceContent(**v)
            elif q_type == QuestionType.LONG_TEXT:
                LongTextContent(**v)
        except Exception as e:
            raise ValueError(f"Invalid content for {q_type}: {str(e)}") from e

        return v


class QuestionCreate(QuestionBase):
    pass


class QuestionRead(QuestionBase):
    id: UUID
