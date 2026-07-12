from pydantic import Field, field_validator

from app.core.enums import AnswerStatus
from app.schemas.base import BaseSchema


class ChallengeResultItem(BaseSchema):
    argument: str
    met: bool | None = None
    reason: str = ""


class RubricResultItem(BaseSchema):
    point: str
    met: bool
    weight: float
    reason: str = ""
    challenge_result: ChallengeResultItem | None = None


class CriterionChallengeInput(BaseSchema):
    criterion_index: int = Field(..., ge=0)
    argument: str = Field(..., min_length=1, max_length=500)


class ChallengeRequest(BaseSchema):
    criteria: list[CriterionChallengeInput] = Field(..., min_length=1)

    @field_validator("criteria")
    @classmethod
    def validate_unique_indices(cls, v: list[CriterionChallengeInput]) -> list[CriterionChallengeInput]:
        indices = [c.criterion_index for c in v]
        if len(indices) != len(set(indices)):
            raise ValueError("Duplicate criterion indices are not allowed")
        return v


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
