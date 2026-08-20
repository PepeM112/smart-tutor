from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionStatus, QuestionType
from app.database import Base
from app.models.base import generate_ulid

if TYPE_CHECKING:
    from app.models.test import Test
    from app.models.test_question_group import TestQuestionGroup
    from app.models.user import User


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
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"), index=True)
    test_id: Mapped[str | None] = mapped_column(String(26), ForeignKey("test.id"))
    # Organizational grouping within a test (e.g. a "Vocabulary" section with a shared title)
    group_id: Mapped[str | None] = mapped_column(String(26), ForeignKey("test_question_group.id"), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    points: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0")
    status: Mapped[int] = mapped_column(Integer, default=int(QuestionStatus.ACTIVE), server_default="1")
    # Links a copied/versioned question back to its source (set during test-version copy or bank duplication)
    origin_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("question.id", ondelete="SET NULL"), nullable=True, default=None
    )

    user: Mapped["User"] = relationship()
    test: Mapped["Test"] = relationship(back_populates="questions")
    question_group: Mapped["TestQuestionGroup | None"] = relationship(back_populates="questions")

    __table_args__ = (
        Index(
            "uq_test_question_order",
            "test_id",
            "order",
            unique=True,
            postgresql_where=(status == int(QuestionStatus.ACTIVE)),
        ),
        Index(
            "uq_group_question_order",
            "group_id",
            "order",
            unique=True,
            postgresql_where=(status == int(QuestionStatus.ACTIVE)),
        ),
    )
