from datetime import datetime
from typing import List

from pydantic import Field

from app.schemas.answer import AnswerRead
from app.schemas.base import BaseSchema


class TestResultBase(BaseSchema):
    test_id: str
    user_id: str
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    total_questions: int
    correct_answers: int


class TestResultCreate(TestResultBase):
    pass


class TestResultRead(TestResultBase):
    id: str
    created_at: datetime
    answers: List[AnswerRead] = []


class TestResultListItem(BaseSchema):
    """Lightweight schema for the history list — no answers array."""

    id: str
    test_id: str
    test_title: str
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    total_questions: int
    correct_answers: int
    created_at: datetime
