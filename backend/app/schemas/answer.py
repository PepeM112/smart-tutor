from app.core.enums import AnswerStatus
from app.schemas.base import BaseSchema


class AnswerBase(BaseSchema):
    test_result_id: str
    question_id: str
    user_answer: str
    status: AnswerStatus


class AnswerCreate(AnswerBase):
    pass


class AnswerRead(AnswerBase):
    id: str
