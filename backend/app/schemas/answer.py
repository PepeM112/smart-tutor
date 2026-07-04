from app.core.enums import AnswerStatus
from app.schemas.base import BaseSchema


class RubricResultItem(BaseSchema):
    point: str
    met: bool
    weight: float
    reason: str = ""


class AnswerBase(BaseSchema):
    test_result_id: str
    question_id: str
    user_answer: str
    status: AnswerStatus


class AnswerCreate(AnswerBase):
    pass


class AnswerRead(AnswerBase):
    id: str
    rubric_result: list[RubricResultItem] | None = None
