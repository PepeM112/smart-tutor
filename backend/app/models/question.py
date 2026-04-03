from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionType
from app.database import Base
from app.models.base import generate_ulid

if TYPE_CHECKING:
    from app.models.test import Test


class Question(Base):
    __tablename__ = "question"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    question_type: Mapped[int] = mapped_column(Integer, default=int(QuestionType.SIMPLE))
    prompt: Mapped[str] = mapped_column(String)
    content: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    hint: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    explanation: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    test_id: Mapped[str] = mapped_column(String(26), ForeignKey("test.id"))

    test: Mapped["Test"] = relationship(back_populates="questions")
