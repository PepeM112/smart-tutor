from typing import List, Optional

from app.core.enums import QuestionGroupType
from app.schemas.base import BaseSchema
from app.schemas.question import QuestionCreate, QuestionRead


class TestQuestionGroupBase(BaseSchema):
    type: QuestionGroupType = QuestionGroupType.UNKNOWN
    order: int = 0


class TestQuestionGroupCreate(TestQuestionGroupBase):
    questions: List[QuestionCreate] = []


class TestQuestionGroupUpdate(BaseSchema):
    type: Optional[QuestionGroupType] = None
    order: Optional[int] = None


class TestQuestionGroupRead(TestQuestionGroupBase):
    id: str
    test_id: str
    questions: List[QuestionRead] = []
