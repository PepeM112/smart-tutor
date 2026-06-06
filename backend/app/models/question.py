from typing import TYPE_CHECKING, Optional

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionType
from app.database import Base
from app.models.base import generate_ulid

if TYPE_CHECKING:
    from app.models.test import Test
    from app.models.test_question_group import TestQuestionGroup


class Question(Base):
    __tablename__ = "question"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    # Discriminator — determines the expected shape of `content` (see schemas/question.py)
    question_type: Mapped[int] = mapped_column(Integer, default=int(QuestionType.SIMPLE))
    # The question text shown to the user (e.g. "How do you say 'to go'?")
    prompt: Mapped[str] = mapped_column(String)
    # Type-specific answer data as JSONB:
    #   SIMPLE → {"answers": ["ir", "marchar"]}
    #   MC     → {"options": [...], "correct_indices": [0, 2]}
    #   LONG   → {"rubric": [{"point": "...", "weight": 0.5}]}
    # Shape enforced at the Pydantic layer, not in the DB.
    content: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    hint: Mapped[str | None] = mapped_column(String, nullable=True, default=None)  # shown before answering
    explanation: Mapped[str | None] = mapped_column(String, nullable=True, default=None)  # shown after answering
    test_id: Mapped[str | None] = mapped_column(String(26), ForeignKey("test.id"))
    # Organizational grouping within a test (e.g. a "Vocabulary" section with a shared title)
    group_id: Mapped[str | None] = mapped_column(String(26), ForeignKey("test_question_group.id"), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    points: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0")

    test: Mapped["Test"] = relationship(back_populates="questions")
    question_group: Mapped[Optional["TestQuestionGroup"]] = relationship(back_populates="questions")

    __table_args__ = (
        UniqueConstraint("test_id", "order", name="uq_test_question_order"),
        UniqueConstraint("group_id", "order", name="uq_group_question_order"),
    )
