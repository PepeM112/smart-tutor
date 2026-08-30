from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import NoteSource
from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class Note(Base, CreatedAtMixin, UpdatedAtMixin):
    __tablename__ = "note"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    content: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[int] = mapped_column(Integer, default=int(NoteSource.USER_CREATED))
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    is_indexed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
