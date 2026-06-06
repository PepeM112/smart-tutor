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
    test_id: Mapped[str] = mapped_column(String(26), ForeignKey("test.id"))
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    total_questions: Mapped[int] = mapped_column(Integer)
    correct_answers: Mapped[int] = mapped_column(Integer)

    answers: Mapped[list["Answer"]] = relationship(cascade="all, delete-orphan", foreign_keys="Answer.test_result_id")
    test: Mapped["Test"] = relationship(foreign_keys=[test_id])

    @property
    def test_title(self) -> str:
        return self.test.title if self.test else ""
