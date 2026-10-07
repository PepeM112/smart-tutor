from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import SPACE_JOIN_CODE_LENGTH, SPACE_TITLE_MAX
from app.core.enums import SpaceKind, SpaceStatus, SpaceVisibility
from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class Space(Base, CreatedAtMixin, UpdatedAtMixin):
    """A shared learning space: a course or a classroom (see docs/spaces.md)."""

    __tablename__ = "space"
    __table_args__ = (
        # Only a course can have a parent (its classroom). The service checks that the parent is a classroom.
        CheckConstraint(f"parent_id IS NULL OR kind = {int(SpaceKind.COURSE)}", name="ck_space_parent_kind"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    kind: Mapped[int] = mapped_column(Integer)
    parent_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # The only owner record. space_member never stores the OWNER role.
    owner_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(SPACE_TITLE_MAX))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    visibility: Mapped[int] = mapped_column(
        Integer, default=int(SpaceVisibility.PRIVATE), server_default=str(int(SpaceVisibility.PRIVATE))
    )
    status: Mapped[int] = mapped_column(
        Integer, default=int(SpaceStatus.ACTIVE), server_default=str(int(SpaceStatus.ACTIVE))
    )
    join_code: Mapped[str | None] = mapped_column(String(SPACE_JOIN_CODE_LENGTH), unique=True, nullable=True)
    # NULL = never published (nobody can join yet).
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
