from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid

if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.user import User


# Per (user, question) SM-2 spaced-repetition state — ease_factor/interval/repetitions follow the SM-2 algorithm
class UserQuestionState(Base, CreatedAtMixin):
    __tablename__ = "user_question_state"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_user_question"),
        Index("ix_user_question_next_review", "user_id", "next_review"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"))
    question_id: Mapped[str] = mapped_column(String(26), ForeignKey("question.id"))
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval: Mapped[int] = mapped_column(Integer, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    next_review: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    question: Mapped["Question"] = relationship(foreign_keys=[question_id])
