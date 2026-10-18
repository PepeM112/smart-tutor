from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SpaceItemCompletion(Base):
    """A VIEWER finished a published item. Sparse: no row = not done (see space_progress_service)."""

    __tablename__ = "space_item_completion"

    # Composite PK (no ULID). The user_id index serves "my progress in a space" and the user delete cascade.
    item_id: Mapped[str] = mapped_column(String(26), ForeignKey("space_item.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
