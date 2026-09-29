from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import NoteSource
from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class Note(Base, CreatedAtMixin, UpdatedAtMixin):
    __tablename__ = "note"
    __table_args__ = (Index("ix_note_user_folder", "user_id", "folder_id"),)

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"))
    folder_id: Mapped[str | None] = mapped_column(
        String(26),
        ForeignKey("folder.id", ondelete="CASCADE"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[int] = mapped_column(Integer, default=int(NoteSource.USER_CREATED))
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    is_indexed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    # Names of folders deleted forever between this note and its current folder (outermost first).
    orphan_path: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
