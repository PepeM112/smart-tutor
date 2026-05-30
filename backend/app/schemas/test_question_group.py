from typing import List, Optional

from app.core.enums import QuestionGroupType
from app.schemas.base import BaseSchema
from app.schemas.question import QuestionCreate, QuestionRead, QuestionReadStripped


class TestQuestionGroupBase(BaseSchema):
    type: QuestionGroupType = QuestionGroupType.UNKNOWN
    order: int = 0
    title: Optional[str] = None


class TestQuestionGroupCreate(TestQuestionGroupBase):
    questions: List[QuestionCreate] = []


class TestQuestionGroupUpdate(BaseSchema):
    type: Optional[QuestionGroupType] = None
    order: Optional[int] = None
    title: Optional[str] = None


class TestQuestionGroupRead(TestQuestionGroupBase):
    id: str
    test_id: str
    questions: List[QuestionRead] = []


class TestQuestionGroupReadStripped(TestQuestionGroupBase):
    id: str
    test_id: str
    questions: List[QuestionReadStripped] = []
