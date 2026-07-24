from app.core.enums import TestStatus
from app.schemas.base import BaseSchema
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
    questions: list[QuestionRead] = []
    question_groups: list[TestQuestionGroupRead] = []


class TestReadStripped(TestBase):
    id: str
    user_id: str
    status: TestStatus
    questions: list[QuestionReadStripped] = []
    question_groups: list[TestQuestionGroupReadStripped] = []
