from typing import Any
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from app.core.schemas import BaseSchema, CreatedAtMixin


class TestResultBase(SQLModel, BaseSchema):
    test_id: UUID = Field(foreign_key="test.id")
    user_id: UUID = Field(foreign_key="user.id")

    score: float = Field(default=0.0, ge=0.0, le=100.0)
    total_questions: int
    correct_answers: int


class TestResult(CreatedAtMixin, TestResultBase, table=True):
    __tablename__: Any = "test_result"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
