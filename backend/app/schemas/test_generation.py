from typing import Literal

from pydantic import Field, field_validator

from app.core.enums import QuestionType
from app.schemas.base import BaseSchema
from app.schemas.question import LongTextContent, MultipleChoiceContent, SimpleContent

ALLOWED_TYPES = {QuestionType.SIMPLE, QuestionType.MULTIPLE_CHOICE, QuestionType.LONG_TEXT}


class TestGenerationRequest(BaseSchema):
    note_id: str
    question_count: int = Field(..., ge=5, le=30)
    question_types: list[QuestionType]
    difficulty: Literal["easy", "medium", "hard"]
    guidance: str | None = Field(default=None, max_length=2000)

    @field_validator("question_types")
    @classmethod
    def validate_question_types(cls, v: list[QuestionType]) -> list[QuestionType]:
        if not v:
            raise ValueError("At least one question type must be selected")
        invalid = set(v) - ALLOWED_TYPES
        if invalid:
            raise ValueError(
                f"Unsupported question types: {invalid}. Only SIMPLE, MULTIPLE_CHOICE and LONG_TEXT are supported"
            )
        return v


class GeneratedQuestionPreview(BaseSchema):
    question_type: QuestionType
    prompt: str
    points: float = 1.0
    content: SimpleContent | MultipleChoiceContent | LongTextContent


class TestGenerationResponse(BaseSchema):
    questions: list[GeneratedQuestionPreview]
    source_note_id: str
    source_note_title: str


class TestRefinementRequest(BaseSchema):
    note_id: str
    current_questions: list[GeneratedQuestionPreview]
    instructions: str = Field(..., min_length=1, max_length=2000)


class QuestionEditRequest(BaseSchema):
    selected_indices: list[int] = Field(..., min_length=1)
    all_questions: list[GeneratedQuestionPreview]
    instructions: str = Field(..., min_length=1, max_length=2000)
    note_content: str | None = None
