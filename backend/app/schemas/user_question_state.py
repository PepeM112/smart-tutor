from datetime import datetime

from app.schemas.base import BaseSchema
from app.schemas.question import QuestionReadStripped


class SRSStateResponse(BaseSchema):
    ease_factor: float
    interval: int
    repetitions: int
    next_review: datetime | None = None


class ReviewResponse(BaseSchema):
    questions: list[QuestionReadStripped]
    has_questions: bool
