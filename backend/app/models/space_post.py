from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class SpacePost(Base, CreatedAtMixin, UpdatedAtMixin):
    """A post in a space's Stream feed (M5). v1: the service only allows CLASSROOM-kind spaces.

    Plain text (`body`). `updated_at > created_at` means the frontend shows "edited" (no separate flag).
    """

    __tablename__ = "space_post"
    __table_args__ = (
        # Newest-first, cursor-paged listing of one space: the id (a ULID) alone sorts by creation time.
        Index("ix_space_post_space_id_id", "space_id", "id"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    space_id: Mapped[str] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
