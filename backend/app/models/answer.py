from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.schemas import BaseSchema
from app.database import Base

# --- ORM Model ---


class Answer(Base):
    __tablename__ = "answer"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    test_result_id: Mapped[UUID] = mapped_column(ForeignKey("test_result.id"))
    question_id: Mapped[UUID] = mapped_column(ForeignKey("question.id"))
    user_answer: Mapped[str] = mapped_column(String)
    is_correct: Mapped[bool] = mapped_column(Boolean)  # Calculated in backend before insertion


# --- Pydantic Schemas ---


class AnswerBase(BaseModel, BaseSchema):
    test_result_id: UUID
    question_id: UUID
    user_answer: str
    is_correct: bool


class AnswerCreate(AnswerBase):
    pass


class AnswerRead(AnswerBase):
    id: UUID
