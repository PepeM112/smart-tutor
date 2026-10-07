from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import SpaceRole
from app.database import Base
from app.models.base import CreatedAtMixin


class SpaceMember(Base, CreatedAtMixin):
    """A user's membership of a space. Only ACTIVE rows give access (see access_service)."""

    __tablename__ = "space_member"
    __table_args__ = (
        # The owner lives in space.owner_id only, so a space can never have two owners.
        CheckConstraint(f"role != {int(SpaceRole.OWNER)}", name="ck_space_member_not_owner"),
    )

    # Composite PK (no ULID): one row per (space, user), and smaller rows. The PK index also serves
    # "members of a space"; the user_id index serves "my spaces" and the user delete cascade.
    space_id: Mapped[str] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[int] = mapped_column(Integer)
    status: Mapped[int] = mapped_column(Integer)
    invited_by: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    # Set when the membership becomes ACTIVE.
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
