from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import TestStatus
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid

if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.test_question_group import TestQuestionGroup


class Test(Base, CreatedAtMixin):
    __tablename__ = "test"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    title: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"))
    status: Mapped[TestStatus] = mapped_column(default=TestStatus.ACTIVE)
    source_note_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("note.id", ondelete="SET NULL"), nullable=True, default=None
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    parent_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("test.id", ondelete="SET NULL"), nullable=True, default=None, index=True
    )

    questions: Mapped[list["Question"]] = relationship(back_populates="test", cascade="all, delete-orphan")
    question_groups: Mapped[list["TestQuestionGroup"]] = relationship(
        back_populates="test", cascade="all, delete-orphan"
    )
