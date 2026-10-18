from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.constants import DEFAULT_PASS_THRESHOLD
from app.core.enums import RevealAnswers, SpaceItemKind
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid

_NOTE, _TEST, _COURSE = int(SpaceItemKind.NOTE), int(SpaceItemKind.TEST), int(SpaceItemKind.COURSE)
# Exactly the target column of the kind is set. A TEST item has no target column: its tests
# (variants) are in `space_item_test`.
_TARGET_CHECK = (
    f"(kind = {_NOTE} AND note_id IS NOT NULL AND child_space_id IS NULL)"
    f" OR (kind = {_TEST} AND note_id IS NULL AND child_space_id IS NULL)"
    f" OR (kind = {_COURSE} AND child_space_id IS NOT NULL AND note_id IS NULL)"
)


class SpaceItem(Base, CreatedAtMixin):
    """One entry of a section: a note, a test, or (M4) a course of a classroom.

    A draft item points to the PUBLISHED content. The content twin (`note.draft_of_id` /
    `test.draft_of_id`) is made only on the first edit (see space_draft_service).
    A TEST item links 1..N tests (variants) through `space_item_test`. The policy columns below
    apply to TEST items only (see docs/spaces.md).
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
    child_space_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space.id", ondelete="CASCADE"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Draft rows only: the published item this draft replaces on publish. NULL = a new item.
    draft_of_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space_item.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # TEST items: the share of the points (0..1) that counts as passed.
    pass_threshold: Mapped[float] = mapped_column(
        Float, default=DEFAULT_PASS_THRESHOLD, server_default=str(DEFAULT_PASS_THRESHOLD), nullable=False
    )
    # NULL = unlimited. Started attempts count, also the expired ones.
    max_attempts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # NULL = no wait between attempts. Counted from the end of the last attempt.
    cooldown_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reveal_answers: Mapped[int] = mapped_column(
        Integer,
        default=int(RevealAnswers.AFTER_PASS_OR_LAST),
        server_default=str(int(RevealAnswers.AFTER_PASS_OR_LAST)),
        nullable=False,
    )
    # NULL = no timer.
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Published rows only. Set by a publish that resets the item: results and attempts from before
    # this time no longer count (best score, completion, attempts used). NULL = nothing was reset.
    # Not copied to drafts or duplicates (`copy_policy` leaves it out).
    progress_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Scheduling (all optional, UTC). `due_at`: shown in "Due soon" (classroom items; allowed on any item).
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # TEST items: attempts can start only inside the window. The attempt deadline is never after `closes_at`.
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # A future value hides the item from students (VIEWER). Authors still see it.
    visible_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
