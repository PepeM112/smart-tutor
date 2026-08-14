from datetime import datetime
from typing import Literal

from app.schemas.base import BaseSchema
from app.schemas.question import QuestionReadStripped

ReviewMode = Literal["review", "practice"]


class SRSStateResponse(BaseSchema):
    ease_factor: float
    interval: int
    repetitions: int
    next_review: datetime | None = None


class ReviewResponse(BaseSchema):
    questions: list[QuestionReadStripped]
    has_questions: bool
