from datetime import datetime
from typing import Literal

from app.core.enums import TestStatus
from app.schemas.base import BaseSchema
from app.schemas.pagination import PaginatedResponse
from app.schemas.question import QuestionCreate, QuestionRead, QuestionReadStripped
from app.schemas.test_question_group import (
    TestQuestionGroupCreate,
    TestQuestionGroupRead,
    TestQuestionGroupReadStripped,
)


class TestBase(BaseSchema):
    title: str
    description: str | None = None


class TestCreate(TestBase):
    questions: list[QuestionCreate] = []
    question_groups: list[TestQuestionGroupCreate] = []
    source_note_id: str | None = None


class TestUpdate(BaseSchema):
    title: str | None = None
    description: str | None = None
    questions: list[QuestionCreate] | None = None
    question_groups: list[TestQuestionGroupCreate] | None = None


class TestRead(TestBase):
    id: str
    user_id: str
    status: TestStatus
    source_note_id: str | None = None
    version: int = 1
    parent_id: str | None = None
    created_at: datetime
    questions: list[QuestionRead] = []
    question_groups: list[TestQuestionGroupRead] = []


class TestReadStripped(TestBase):
    id: str
    user_id: str
    status: TestStatus
    questions: list[QuestionReadStripped] = []
    question_groups: list[TestQuestionGroupReadStripped] = []


# Columns the tests list can be sorted by (see crud/test.py list_by_user).
TestSortBy = Literal["title", "created_at"]
SortOrder = Literal["asc", "desc"]

PaginatedTestRead = PaginatedResponse[TestRead]
