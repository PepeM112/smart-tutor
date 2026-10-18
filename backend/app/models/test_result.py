from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid

if TYPE_CHECKING:
    from app.models.answer import Answer
    from app.models.test import Test


class TestResult(Base, CreatedAtMixin):
    __tablename__ = "test_result"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    test_id: Mapped[str] = mapped_column(String(26), ForeignKey("test.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"), index=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    total_questions: Mapped[int] = mapped_column(Integer)
    correct_answers: Mapped[int] = mapped_column(Integer)
    pending_answers: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    earned_points: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    total_points: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")

    # Set when the result comes from an attempt on a course test item. SET NULL if the item is removed.
    space_item_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space_item.id", ondelete="SET NULL"), nullable=True, index=True
    )

    answers: Mapped[list["Answer"]] = relationship(cascade="all, delete-orphan", foreign_keys="Answer.test_result_id")
    test: Mapped["Test"] = relationship(foreign_keys=[test_id])

    @property
    def test_title(self) -> str:
        return self.test.title if self.test else ""

    @property
    def is_older_version(self) -> bool:
        """The result is on a frozen snapshot: the test was edited after this exam."""
        return self.test is not None and self.test.parent_id is not None
