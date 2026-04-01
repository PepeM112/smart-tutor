from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class TestResultBase(BaseSchema):
    test_id: UUID
    user_id: UUID
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    total_questions: int
    correct_answers: int


class TestResultCreate(TestResultBase):
    pass


class TestResultRead(TestResultBase):
    id: UUID
