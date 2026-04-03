from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid

if TYPE_CHECKING:
    from app.models.question import Question


class Test(Base, CreatedAtMixin):
    __tablename__ = "test"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    title: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"))

    questions: Mapped[List["Question"]] = relationship(back_populates="test", cascade="all, delete-orphan")
