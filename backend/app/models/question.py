from typing import TYPE_CHECKING, Any, Dict, Optional
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionType
from app.database import Base

if TYPE_CHECKING:
    from app.models.test import Test


class Question(Base):
    __tablename__ = "question"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    question_type: Mapped[int] = mapped_column(Integer, default=int(QuestionType.SIMPLE))
    prompt: Mapped[str] = mapped_column(String)
    content: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    hint: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    explanation: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    test_id: Mapped[UUID] = mapped_column(ForeignKey("test.id"))

    test: Mapped["Test"] = relationship(back_populates="questions")
