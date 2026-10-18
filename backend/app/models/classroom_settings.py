from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import FeedPermission, KeyPriority, KeyScope
from app.database import Base


class ClassroomSettings(Base):
    """The settings of a classroom (one row per classroom, made with it). Owner only (see docs/spaces.md)."""

    __tablename__ = "classroom_settings"

    space_id: Mapped[str] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), primary_key=True)
    # Used by the stream (M5).
    feed_permission: Mapped[int] = mapped_column(
        Integer,
        default=int(FeedPermission.STUDENTS_COMMENT),
        server_default=str(int(FeedPermission.STUDENTS_COMMENT)),
        nullable=False,
    )
    # The Class key (Phase B): provider + Fernet-encrypted key. NULL = no Class key.
    ai_provider: Mapped[int | None] = mapped_column(Integer, nullable=True)
    encrypted_class_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_priority: Mapped[int] = mapped_column(
        Integer, default=int(KeyPriority.CLASS), server_default=str(int(KeyPriority.CLASS)), nullable=False
    )
    key_scope: Mapped[int] = mapped_column(
        Integer,
        default=int(KeyScope.CLASSROOM_CONTENT),
        server_default=str(int(KeyScope.CLASSROOM_CONTENT)),
        nullable=False,
    )
    # NULL = no cap.
    monthly_token_cap_per_student: Mapped[int | None] = mapped_column(Integer, nullable=True)
