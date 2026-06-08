from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AnswerStatus
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class Answer(Base, CreatedAtMixin):
    __tablename__ = "answer"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    test_result_id: Mapped[str] = mapped_column(String(26), ForeignKey("test_result.id"), nullable=True)
    question_id: Mapped[str] = mapped_column(String(26), ForeignKey("question.id"))
    user_answer: Mapped[str] = mapped_column(String)
    status: Mapped[int] = mapped_column(Integer, default=int(AnswerStatus.PENDING))
    rubric_result: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
