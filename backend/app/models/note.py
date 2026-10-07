from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class Note(Base, CreatedAtMixin, UpdatedAtMixin):
    __tablename__ = "note"
    __table_args__ = (
        Index("ix_note_user_folder", "user_id", "folder_id"),
        # Only space content has drafts.
        CheckConstraint(
            "space_id IS NOT NULL OR (is_draft = false AND draft_of_id IS NULL)", name="ck_note_personal_flags"
        ),
        # Folders, Trash and favorites are personal only. Because of this, Trash and folder-content
        # queries can never return a space note and need no `space_id IS NULL` filter.
        CheckConstraint(
            "space_id IS NULL OR (folder_id IS NULL AND deleted_at IS NULL AND is_favorite = false)",
            name="ck_note_space_flags",
        ),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id", ondelete="CASCADE"))
    # Own index: the FK cascade on a folder delete looks up notes by folder_id only, and it
    # can not use `ix_note_user_folder`, because user_id is its first column.
    folder_id: Mapped[str | None] = mapped_column(
        String(26),
        ForeignKey("folder.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    is_indexed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # When the note was starred (the sidebar shows the newest first). None when not a favorite.
    favorited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Names of folders deleted forever between this note and its current folder (outermost first).
    orphan_path: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # Space (course / classroom) that owns this note. NULL = personal. `user_id` is then the creator only.
    space_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Space content only: true for a row members can not see yet (new in edit mode, or a twin).
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Space content only: the published note this draft twin will replace on publish.
    draft_of_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("note.id", ondelete="CASCADE"), nullable=True, index=True
    )
