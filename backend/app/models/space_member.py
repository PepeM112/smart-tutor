from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import SpaceRole
from app.database import Base
from app.models.base import CreatedAtMixin


class SpaceMember(Base, CreatedAtMixin):
    """A user's membership of a space. Only ACTIVE rows give access (see access_service).

    A course of a classroom has no member list of its own: its students are the classroom members.
    A row with `role = NULL` is a lazy row: it only holds the personal state (progress, Review opt-in,
    last item) and inherits the role of the classroom (see space_progress_service.get_member_row).
    """

    __tablename__ = "space_member"
    __table_args__ = (
        # The owner lives in space.owner_id only, so a space can never have two owners.
        # NULL is allowed: it means "inherit the role of the parent classroom".
        CheckConstraint(f"role != {int(SpaceRole.OWNER)}", name="ck_space_member_not_owner"),
    )

    # Composite PK (no ULID): one row per (space, user), and smaller rows. The PK index also serves
    # "members of a space"; the user_id index serves "my spaces" and the user delete cascade.
    space_id: Mapped[str] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[int] = mapped_column(Integer)
    invited_by: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    # Set when the membership becomes ACTIVE.
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Review (SRS) includes the questions of this course. Off by default.
    include_in_srs: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # The item the student opened last ("Continue" opens it). SET NULL when the item is removed.
    last_item_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space_item.id", ondelete="SET NULL"), nullable=True, index=True
    )
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set when every published item is done, cleared when a publish adds items or resets them.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
