from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedAtMixin, UpdatedAtMixin, generate_ulid


class Folder(Base, CreatedAtMixin, UpdatedAtMixin):
    __tablename__ = "folder"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    parent_id: Mapped[str | None] = mapped_column(
        String(26),
        ForeignKey("folder.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
