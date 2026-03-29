from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy import Float, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.schemas import BaseSchema, CreatedAtMixin
from app.database import Base

# --- ORM Model ---


class TestResult(Base, CreatedAtMixin):
    __tablename__ = "test_result"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    test_id: Mapped[UUID] = mapped_column(ForeignKey("test.id"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("user.id"))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    total_questions: Mapped[int] = mapped_column(Integer)
    correct_answers: Mapped[int] = mapped_column(Integer)


# --- Pydantic Schemas ---


class TestResultBase(BaseModel, BaseSchema):
    test_id: UUID
    user_id: UUID
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    total_questions: int
    correct_answers: int


class TestResultCreate(TestResultBase):
    pass


class TestResultRead(TestResultBase):
    id: UUID
