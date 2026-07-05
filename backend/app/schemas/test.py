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


class TestUpdate(BaseSchema):
    title: str | None = None
    description: str | None = None
    questions: list[QuestionCreate] = []
    question_groups: list[TestQuestionGroupCreate] = []


class TestRead(TestBase):
    id: str
    user_id: str
    status: int
    questions: list[QuestionRead] = []
    question_groups: list[TestQuestionGroupRead] = []


class TestReadStripped(TestBase):
    id: str
    user_id: str
    status: int
    questions: list[QuestionReadStripped] = []
    question_groups: list[TestQuestionGroupReadStripped] = []
