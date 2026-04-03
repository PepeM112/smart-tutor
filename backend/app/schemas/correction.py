from typing import List

from app.core.enums import AnswerStatus
from app.schemas.base import BaseSchema


class QuestionAnswer(BaseSchema):
    """A single answer within a test submission."""

    question_id: str
    user_answer: str


class TestSubmission(BaseSchema):
    """Payload for submitting a full test for correction."""

    answers: List[QuestionAnswer]


class QuestionCheckRequest(BaseSchema):
    """Payload for checking a single question answer."""

    user_answer: str


class QuestionCheckResponse(BaseSchema):
    """Response for a single question check."""

    status: AnswerStatus
