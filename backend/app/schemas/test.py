from typing import List, Optional

from app.schemas.base import BaseSchema
from app.schemas.question import QuestionCreate, QuestionRead, QuestionReadStripped
from app.schemas.test_question_group import (
    TestQuestionGroupCreate,
    TestQuestionGroupRead,
    TestQuestionGroupReadStripped,
)


class TestBase(BaseSchema):
    title: str
    description: Optional[str] = None


class TestCreate(TestBase):
    questions: List[QuestionCreate] = []
    question_groups: List[TestQuestionGroupCreate] = []


class TestUpdate(BaseSchema):
    title: Optional[str] = None
    description: Optional[str] = None
    questions: List[QuestionCreate] = []
    question_groups: List[TestQuestionGroupCreate] = []


class TestRead(TestBase):
    id: str
    user_id: str
    questions: List[QuestionRead] = []
    question_groups: List[TestQuestionGroupRead] = []


class TestReadStripped(TestBase):
    id: str
    user_id: str
    questions: List[QuestionReadStripped] = []
    question_groups: List[TestQuestionGroupReadStripped] = []
