from app.core.enums import QuestionGroupType
from app.schemas.base import BaseSchema
from app.schemas.question import QuestionCreate, QuestionRead, QuestionReadStripped


class TestQuestionGroupBase(BaseSchema):
    type: QuestionGroupType = QuestionGroupType.UNKNOWN
    order: int = 0
    title: str | None = None
    points: float = 1.0


class TestQuestionGroupCreate(TestQuestionGroupBase):
    questions: list[QuestionCreate] = []


class TestQuestionGroupRead(TestQuestionGroupBase):
    id: str
    test_id: str
    questions: list[QuestionRead] = []


class TestQuestionGroupReadStripped(TestQuestionGroupBase):
    id: str
    test_id: str
    questions: list[QuestionReadStripped] = []
