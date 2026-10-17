from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import SPACE_TITLE_MAX
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class SpaceSection(Base, CreatedAtMixin):
    """An ordered group of items in a space. Edit mode clones every published section as a draft row."""

    __tablename__ = "space_section"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    space_id: Mapped[str] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(SPACE_TITLE_MAX))
    position: Mapped[int] = mapped_column(Integer)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Draft rows only: the published section this draft replaces on publish. NULL = a new section.
    draft_of_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space_section.id", ondelete="CASCADE"), nullable=True, index=True
    )
