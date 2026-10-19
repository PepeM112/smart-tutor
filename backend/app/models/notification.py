from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class Notification(Base, CreatedAtMixin):
    """One row per recipient (fan-out on write), typed by `NotificationType` with a JSON `payload` (see docs/spaces.md).

    `payload` stores titles and ids at write time, so the frontend renders text and a link without joins.
    `dedupe_key` is nullable: Postgres treats NULLs as distinct in a unique constraint, so only an event that
    needs idempotency (due-soon) sets it; every other event leaves it NULL and is never deduped.
    """

    __tablename__ = "notification"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_notification_user_dedupe"),
        Index("ix_notification_user_read_created", "user_id", "read_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id", ondelete="CASCADE"), index=True)
    type: Mapped[int] = mapped_column(Integer)
    # NULL for a future non-space event. A delete-forever of the space removes its notifications with it.
    space_id: Mapped[str | None] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), nullable=True)
    # The user who caused the event (never the recipient). SET NULL: a deleted actor keeps old notifications.
    actor_id: Mapped[str | None] = mapped_column(String(26), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict, server_default="{}")
    dedupe_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
