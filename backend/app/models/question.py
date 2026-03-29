from typing import Any, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ValidationInfo, field_validator
from sqlmodel import JSON, Column, Field, SQLModel

from app.core.enums import QuestionType
from app.core.schemas import BaseSchema


# --- Interfaces for QuestionBase.content ---
class RubricItem(BaseModel):
    point: str = Field(..., description="The concept or fact the user must mention")
    weight: float = Field(..., ge=0.0, le=1.0, description="Score contribution (0.0 to 1.0)")


class SimpleContent(BaseModel):
    answers: List[str]


class MultipleChoiceContent(BaseModel):
    options: List[str] = Field(..., min_length=2, max_length=6)
    correct_indices: List[int]  # [0] or [0, 2] for multiple answers


class LongTextContent(BaseModel):
    rubric: List[RubricItem]


class QuestionBase(SQLModel, BaseSchema):
    question_type: QuestionType = Field(default=QuestionType.SIMPLE)
    prompt: str  # Can be text or an Image URL

    content: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    hint: Optional[str] = None
    explanation: Optional[str] = None
    test_id: UUID = Field(foreign_key="test.id")

    @field_validator("content")
    @classmethod
    def validate_content_schema(cls, v: dict[str, Any], info: ValidationInfo) -> dict[str, Any]:
        q_type = info.data.get("question_type")

        try:
            if q_type == QuestionType.SIMPLE:
                SimpleContent(**v)  # Si falla, lanza error
            elif q_type == QuestionType.MULTIPLE_CHOICE:
                MultipleChoiceContent(**v)
            elif q_type == QuestionType.LONG_TEXT:
                LongTextContent(**v)
        except Exception as e:
            raise ValueError(f"Invalid content for {q_type}: {str(e)}") from e

        return v


class Question(QuestionBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
