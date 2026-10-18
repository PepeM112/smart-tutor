from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AttemptStatus
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class SpaceAttempt(Base, CreatedAtMixin):
    """One started attempt of a VIEWER on a TEST item. It pins the variant, the test version and the deadline.

    A started attempt counts for `max_attempts`, also an expired one (see space_attempt_service).
    """

    __tablename__ = "space_attempt"
    __table_args__ = (
        Index("ix_space_attempt_user_item", "user_id", "item_id"),
        # One OPEN attempt per (user, item): two parallel starts can not both insert.
        Index(
            "uq_space_attempt_open",
            "user_id",
            "item_id",
            unique=True,
            postgresql_where=f"status = {int(AttemptStatus.OPEN)}",
        ),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    item_id: Mapped[str] = mapped_column(String(26), ForeignKey("space_item.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id", ondelete="CASCADE"))
    # The LIVE variant (never a snapshot), so the variant counts need no coalesce.
    test_id: Mapped[str] = mapped_column(String(26), ForeignKey("test.id", ondelete="CASCADE"), index=True)
    # `test.version` at the start. The submit is graded against this version.
    test_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[int] = mapped_column(Integer, default=int(AttemptStatus.OPEN))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # NULL = no timer.
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    test_result_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("test_result.id", ondelete="SET NULL"), nullable=True
    )
