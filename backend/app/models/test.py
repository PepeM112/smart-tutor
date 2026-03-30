from typing import TYPE_CHECKING, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.question import Question


class Test(Base):
    __tablename__ = "test"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("user.id"))

    questions: Mapped[List["Question"]] = relationship(back_populates="test", cascade="all, delete-orphan")
