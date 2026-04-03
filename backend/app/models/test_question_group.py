from typing import TYPE_CHECKING, List

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionGroupType
from app.database import Base
from app.models.base import generate_ulid

if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.test import Test


class TestQuestionGroup(Base):
    __tablename__ = "test_question_group"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    test_id: Mapped[str] = mapped_column(String(26), ForeignKey("test.id"))
    type: Mapped[int] = mapped_column(Integer, default=int(QuestionGroupType.VOCABULARY))
    order: Mapped[int] = mapped_column(Integer)

    test: Mapped["Test"] = relationship(back_populates="question_groups")
    questions: Mapped[List["Question"]] = relationship(
        back_populates="question_group",
        cascade="all, delete-orphan",
    )

    __table_args__ = (UniqueConstraint("test_id", "order", name="uq_test_group_order"),)
