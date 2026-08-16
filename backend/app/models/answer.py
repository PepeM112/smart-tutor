from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AnswerStatus
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid

if TYPE_CHECKING:
    from app.models.test_result import TestResult


class Answer(Base, CreatedAtMixin):
    __tablename__ = "answer"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    # Null for answers from practice/review checks — only exam submissions create a TestResult
    test_result_id: Mapped[str | None] = mapped_column(String(26), ForeignKey("test_result.id"), nullable=True)
    question_id: Mapped[str] = mapped_column(String(26), ForeignKey("question.id"))
    user_answer: Mapped[str] = mapped_column(String)
    status: Mapped[int] = mapped_column(Integer, default=int(AnswerStatus.PENDING))
    rubric_result: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    # viewonly: TestResult.answers owns cascade/delete-orphan on this FK; this reverse side must not also manage it
    test_result: Mapped["TestResult | None"] = relationship(
        back_populates="answers", foreign_keys=[test_result_id], viewonly=True
    )
