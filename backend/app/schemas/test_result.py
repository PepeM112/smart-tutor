from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.answer import AnswerRead
from app.schemas.base import BaseSchema
from app.schemas.pagination import PaginatedResponse


class TestResultBase(BaseSchema):
    test_id: str
    user_id: str
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    total_questions: int
    correct_answers: int
    pending_answers: int = 0
    earned_points: float = 0.0
    total_points: float = 0.0


class TestResultCreate(TestResultBase):
    pass


class TestResultRead(TestResultBase):
    id: str
    created_at: datetime
    # Course results only: the item of the attempt.
    space_item_id: str | None = None
    # The test was edited after this exam: the result belongs to a frozen version.
    is_older_version: bool = False
    # The viewer is a teacher (OWNER / EDITOR) of the classroom that owns the item: they may override grades.
    can_override: bool = False
    answers: list[AnswerRead] = []


class TestResultListItem(BaseSchema):
    """Lightweight schema for the history list — no answers array."""

    id: str
    test_id: str
    test_title: str
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    total_questions: int
    correct_answers: int
    pending_answers: int = 0
    earned_points: float = 0.0
    total_points: float = 0.0
    created_at: datetime
    space_item_id: str | None = None
    is_older_version: bool = False
    # The title of the course, for a result of a course attempt. None for a personal result.
    space_title: str | None = None


TestResultSortBy = Literal["score", "created_at"]
SortOrder = Literal["asc", "desc"]

PaginatedTestResultListItem = PaginatedResponse[TestResultListItem]
