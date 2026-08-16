from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionGroupType, QuestionStatus
from app.database import Base
from app.models.base import generate_ulid

if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.test import Test


class TestQuestionGroup(Base):
    __tablename__ = "test_question_group"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    test_id: Mapped[str] = mapped_column(String(26), ForeignKey("test.id"))
    type: Mapped[int] = mapped_column(Integer, default=int(QuestionGroupType.GENERIC))
    order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    points: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0")
    status: Mapped[int] = mapped_column(Integer, default=int(QuestionStatus.ACTIVE), server_default="1")
    # Links a copied/versioned group back to its source group (see Test.parent_id)
    origin_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("test_question_group.id", ondelete="SET NULL"), nullable=True, default=None
    )

    test: Mapped["Test"] = relationship(back_populates="question_groups")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="question_group",
    )

    __table_args__ = (UniqueConstraint("test_id", "order", name="uq_test_group_order"),)
