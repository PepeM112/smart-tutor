from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from app.core.schemas import BaseSchema


class Answer(SQLModel, BaseSchema, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    test_result_id: UUID = Field(foreign_key="test_result.id")
    question_id: UUID = Field(foreign_key="question.id")

    user_answer: str
    is_correct: bool  # Calculated in backend before insertion
