from uuid import UUID

from app.core.base_schema import BaseSchema


class AnswerBase(BaseSchema):
    test_result_id: UUID
    question_id: UUID
    user_answer: str
    is_correct: bool


class AnswerCreate(AnswerBase):
    pass


class AnswerRead(AnswerBase):
    id: UUID
