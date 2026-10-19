from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class SpaceComment(Base, CreatedAtMixin, UpdatedAtMixin):
    """A flat comment on a `SpacePost`. Plain text (`body`)."""

    __tablename__ = "space_comment"
    __table_args__ = (
        # Oldest-first listing of one post's comments: the id (a ULID) alone sorts by creation time.
        Index("ix_space_comment_post_id_id", "post_id", "id"),
    )

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    post_id: Mapped[str] = mapped_column(String(26), ForeignKey("space_post.id", ondelete="CASCADE"))
    author_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
