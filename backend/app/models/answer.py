from uuid import UUID, uuid4

from core.enums import AnswerStatus
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Answer(Base):
    __tablename__ = "answer"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    question_id: Mapped[UUID] = mapped_column(ForeignKey("question.id"))
    user_answer: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(Integer, default=AnswerStatus.PENDING)
