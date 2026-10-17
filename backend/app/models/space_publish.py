from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class SpacePublish(Base, CreatedAtMixin):
    """The log of a space: one row per publish."""

    __tablename__ = "space_publish"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    space_id: Mapped[str] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), index=True)
    published_by: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stored now; the notifications (M5) read it.
    notify_members: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Published item ids whose completion resets. Stored now; the completion table (M3) applies it.
    reset_item_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
