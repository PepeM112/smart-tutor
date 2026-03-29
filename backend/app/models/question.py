from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, ValidationInfo, field_validator
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionType
from app.core.schemas import BaseSchema
from app.database import Base

if TYPE_CHECKING:
    from app.models.test import Test

# --- Content sub-models (used by Pydantic schema validation) ---


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


# --- ORM Model ---


class Question(Base):
    __tablename__ = "question"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    question_type: Mapped[int] = mapped_column(Integer, default=int(QuestionType.SIMPLE))
    prompt: Mapped[str] = mapped_column(String)
    content: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    hint: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    explanation: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    test_id: Mapped[UUID] = mapped_column(ForeignKey("test.id"))

    test: Mapped["Test"] = relationship(back_populates="questions")


# --- Pydantic Schemas ---


class QuestionBase(BaseModel, BaseSchema):
    question_type: QuestionType = QuestionType.SIMPLE
    prompt: str  # Can be text or an Image URL
    content: Dict[str, Any] = {}
    hint: Optional[str] = None
    explanation: Optional[str] = None
    test_id: UUID

    @field_validator("content")
    @classmethod
    def validate_content_schema(cls, v: dict[str, Any], info: ValidationInfo) -> dict[str, Any]:
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
