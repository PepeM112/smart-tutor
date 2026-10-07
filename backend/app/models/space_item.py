from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import SpaceItemKind
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid

_NOTE, _TEST, _COURSE = int(SpaceItemKind.NOTE), int(SpaceItemKind.TEST), int(SpaceItemKind.COURSE)
# Exactly the target column of the kind is set.
_TARGET_CHECK = (
    f"(kind = {_NOTE} AND note_id IS NOT NULL AND test_id IS NULL AND child_space_id IS NULL)"
    f" OR (kind = {_TEST} AND test_id IS NOT NULL AND note_id IS NULL AND child_space_id IS NULL)"
    f" OR (kind = {_COURSE} AND child_space_id IS NOT NULL AND note_id IS NULL AND test_id IS NULL)"
)


class SpaceItem(Base, CreatedAtMixin):
    """One entry of a section: a note, a test, or (M4) a course of a classroom.

    A draft item points to the PUBLISHED content. The content twin (`note.draft_of_id` /
    `test.draft_of_id`) is made only on the first edit (see space_draft_service).
    """

    __tablename__ = "space_item"
    __table_args__ = (CheckConstraint(_TARGET_CHECK, name="ck_space_item_target"),)

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    space_id: Mapped[str] = mapped_column(String(26), ForeignKey("space.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[str] = mapped_column(String(26), ForeignKey("space_section.id", ondelete="CASCADE"), index=True)
    kind: Mapped[int] = mapped_column(Integer)
    note_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("note.id", ondelete="CASCADE"), nullable=True, index=True
    )
    test_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("test.id", ondelete="CASCADE"), nullable=True, index=True
    )
    child_space_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space.id", ondelete="CASCADE"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Draft rows only: the published item this draft replaces on publish. NULL = a new item.
    draft_of_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space_item.id", ondelete="CASCADE"), nullable=True, index=True
    )
