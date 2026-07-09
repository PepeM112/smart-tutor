from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import NoteSource
from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class Note(Base, CreatedAtMixin, UpdatedAtMixin):
    __tablename__ = "note"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"))
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[int] = mapped_column(Integer, default=int(NoteSource.UNKNOWN))
