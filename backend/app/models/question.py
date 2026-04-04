from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
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
    question_type: Mapped[int] = mapped_column(Integer, default=int(QuestionType.SIMPLE))
    prompt: Mapped[str] = mapped_column(String)
    content: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    hint: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    explanation: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    test_id: Mapped[Optional[str]] = mapped_column(String(26), ForeignKey("test.id"))
    group_id: Mapped[Optional[str]] = mapped_column(String(26), ForeignKey("test_question_group.id"), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)

    test: Mapped["Test"] = relationship(back_populates="questions")
    question_group: Mapped[Optional["TestQuestionGroup"]] = relationship(back_populates="questions")

    __table_args__ = (
        UniqueConstraint("test_id", "order", name="uq_test_question_order"),
        UniqueConstraint("group_id", "order", name="uq_group_question_order"),
    )
