from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.core.constants import SPACE_TITLE_MAX
from app.core.enums import (
    AIProvider,
    FeedPermission,
    KeyPriority,
    KeyScope,
    MemberStatus,
    RevealAnswers,
    SpaceItemKind,
    SpaceKind,
    SpaceRole,
    SpaceStatus,
    SpaceVisibility,
)
from app.schemas.base import BaseSchema
from app.schemas.note import normalize_tags
from app.schemas.pagination import PaginatedResponse
from app.schemas.test import TestReadStripped

SPACE_DESCRIPTION_MAX = 5000
SPACE_PUBLISH_MESSAGE_MAX = 2000


def _reject_null(value: object) -> object:
    """An explicit JSON null must not get through an optional update field (it would write NULL)."""
    if value is None:
        raise ValueError("Field cannot be null; omit it to leave it unchanged")
    return value


# ── Space ─────────────────────────────────────────────────────────────────────


class _SpaceMetadata(BaseSchema):
    """The fields that create and duplicate share."""

    title: str = Field(min_length=1, max_length=SPACE_TITLE_MAX)
    description: str = Field(default="", max_length=SPACE_DESCRIPTION_MAX)
    tags: list[str] = []

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, tags: list[str]) -> list[str]:
        return normalize_tags(tags)


class SpaceCreate(_SpaceMetadata):
    visibility: SpaceVisibility = SpaceVisibility.PRIVATE


class ClassroomCreate(_SpaceMetadata):
    """A classroom is never public: it has no catalog."""

    visibility: Literal[SpaceVisibility.PRIVATE, SpaceVisibility.UNLISTED] = SpaceVisibility.PRIVATE


class SpaceUpdate(BaseSchema):
    title: str | None = Field(default=None, min_length=1, max_length=SPACE_TITLE_MAX)
    description: str | None = Field(default=None, max_length=SPACE_DESCRIPTION_MAX)
    tags: list[str] | None = None
    visibility: SpaceVisibility | None = None

    @field_validator("title", "description", "tags", "visibility", mode="before")
    @classmethod
    def _no_null(cls, value: object) -> object:
        return _reject_null(value)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, tags: list[str] | None) -> list[str] | None:
        return None if tags is None else normalize_tags(tags)


class SpaceProgress(BaseSchema):
    """The progress of a VIEWER in a course: done items of the published items."""

    completed_items: int
    total_items: int
    percent: int
    # "Continue" opens this item. None = no item opened yet (or it was removed).
    last_item_id: str | None = None
    # Set when every published item is done.
    completed_at: datetime | None = None


class SpaceSummary(BaseSchema):
    """A space in a list (my courses, catalog, invitations)."""

    id: str
    kind: SpaceKind
    # The classroom of a classroom course. None for a standalone course and for a classroom.
    parent_id: str | None = None
    owner_id: str
    owner_name: str
    title: str
    description: str
    tags: list[str]
    visibility: SpaceVisibility
    status: SpaceStatus
    published_at: datetime | None
    archived_at: datetime | None
    created_at: datetime
    member_count: int
    # The role of the current user. None = not a member (catalog, invitation).
    my_role: SpaceRole | None
    # The status of the current user's membership row. None for the owner and for non-members.
    my_status: MemberStatus | None
    # VIEWER only (None for owner, editor and non-members: they have no progress rows).
    progress: SpaceProgress | None = None
    # The questions of this course are in the Review of the current user (opt-in, off by default).
    include_in_srs: bool = False


class SpaceItemVariantRead(BaseSchema):
    """One test (variant) of a TEST item. Authors only."""

    test_id: str
    title: str
    position: int


class SpaceItemRead(BaseSchema):
    id: str
    section_id: str
    kind: SpaceItemKind
    note_id: str | None
    test_id: str | None
    # COURSE items (classroom only): the course. `title` is the title of the course.
    child_space_id: str | None = None
    position: int
    # The title of the content. For a draft item with an edited twin, the title of the twin.
    title: str
    is_draft: bool
    draft_of_id: str | None
    # Draft items only: the content is new or has an edited twin (it changes on publish).
    has_changes: bool = False
    # TEST items: the attempt policy. `test_id` above is the first variant.
    pass_threshold: float | None = None
    max_attempts: int | None = None
    cooldown_hours: int | None = None
    reveal_answers: RevealAnswers | None = None
    time_limit_minutes: int | None = None
    # Scheduling (UTC). `due_at`: shown in "Due soon". `opens_at` / `closes_at`: TEST items, attempts
    # can start inside the window only. `visible_from` in the future: hidden from students.
    due_at: datetime | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    visible_from: datetime | None = None
    # TEST items, authors only: the variants in order.
    variants: list[SpaceItemVariantRead] = []
    # Per-user fields, VIEWER only (the defaults mean "no progress").
    completed: bool = False
    best_score: float | None = None
    attempts_used: int | None = None
    # None = unlimited.
    attempts_left: int | None = None
    # The earliest time of the next attempt (cooldown). None = now.
    next_attempt_at: datetime | None = None
    open_attempt_id: str | None = None
    open_attempt_deadline_at: datetime | None = None
    # COURSE items, VIEWER only: the progress of the student in that course.
    child_progress: SpaceProgress | None = None


class SpaceSectionRead(BaseSchema):
    id: str
    title: str
    position: int
    is_draft: bool
    draft_of_id: str | None
    items: list[SpaceItemRead]


class SpaceDetail(SpaceSummary):
    """One space with its structure.

    `sections` = the published structure (everyone with READ, and non-members of a PUBLIC /
    UNLISTED course as a preview). `draft_sections` = the draft structure, only for an
    OWNER / EDITOR while edit mode is on.
    """

    # The title of the classroom of a classroom course.
    parent_title: str | None = None
    can_edit: bool
    is_owner: bool
    is_editing: bool
    # Authors in edit mode: publish would change what members see. Publish is refused (409) when false.
    has_unpublished_changes: bool
    # OWNER / EDITOR only.
    join_code: str | None
    sections: list[SpaceSectionRead]
    draft_sections: list[SpaceSectionRead] | None


SpaceCatalogSort = Literal["newest", "members"]
# My courses: archived courses are hidden by default.
SpaceListStatus = Literal["active", "archived", "all"]

PaginatedSpaceSummary = PaginatedResponse[SpaceSummary]


class SpaceDuplicateRequest(_SpaceMetadata):
    """The metadata of the new course. The dialog fills it with the values of the source."""


class SpaceDeleteConfirm(BaseSchema):
    """Body of the delete-forever request: the exact title of the space."""

    title: str


# ── Structure (edit mode) ─────────────────────────────────────────────────────


class SpaceSectionCreate(BaseSchema):
    title: str = Field(min_length=1, max_length=SPACE_TITLE_MAX)


class SpaceSectionUpdate(BaseSchema):
    title: str = Field(min_length=1, max_length=SPACE_TITLE_MAX)


class SpaceItemCreate(BaseSchema):
    """A new, empty note or test in a section."""

    section_id: str
    kind: Literal[SpaceItemKind.NOTE, SpaceItemKind.TEST]
    title: str = Field(min_length=1, max_length=SPACE_TITLE_MAX)


class SpaceItemCopy(BaseSchema):
    """Copy a personal note or test into a section (a new row, no link to the original)."""

    section_id: str
    note_id: str | None = None
    test_id: str | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "SpaceItemCopy":
        if (self.note_id is None) == (self.test_id is None):
            raise ValueError("Send exactly one of noteId and testId")
        return self


class SpaceItemContent(BaseSchema):
    """The id of the content row the author edits for an item (the draft twin, or the new draft)."""

    note_id: str | None
    test_id: str | None


class SpaceItemUpdate(BaseSchema):
    """The attempt policy of a TEST item and the schedule of any item. Only the sent fields change.

    `max_attempts`, `cooldown_hours` and `time_limit_minutes`: null = no limit (a sent null is valid).
    `due_at`, `opens_at`, `closes_at` and `visible_from`: null = clear (a sent null is valid).
    `opens_at` and `closes_at` apply to TEST items only.
    """

    pass_threshold: float | None = Field(default=None, ge=0, le=1)
    max_attempts: int | None = Field(default=None, ge=1)
    cooldown_hours: int | None = Field(default=None, ge=1)
    reveal_answers: RevealAnswers | None = None
    time_limit_minutes: int | None = Field(default=None, ge=1)
    due_at: datetime | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    visible_from: datetime | None = None

    @field_validator("pass_threshold", "reveal_answers", mode="before")
    @classmethod
    def _no_null(cls, value: object) -> object:
        return _reject_null(value)

    @model_validator(mode="after")
    def _window_order(self) -> "SpaceItemUpdate":
        if self.opens_at is not None and self.closes_at is not None and self.closes_at <= self.opens_at:
            raise ValueError("closesAt must be after opensAt")
        return self


class SpaceVariantCreate(BaseSchema):
    """Add a variant to a TEST item: a new empty test (`title`) or a copy of a personal test (`test_id`)."""

    title: str | None = Field(default=None, min_length=1, max_length=SPACE_TITLE_MAX)
    test_id: str | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "SpaceVariantCreate":
        if (self.title is None) == (self.test_id is None):
            raise ValueError("Send exactly one of title and testId")
        return self


class SpaceVariantOrder(BaseSchema):
    """The full order of the variants of an item."""

    test_ids: list[str]


class SpaceSectionOrder(BaseSchema):
    id: str
    item_ids: list[str]


class SpaceDraftOrder(BaseSchema):
    """The full order of the draft structure: every draft section, each with all its draft items."""

    sections: list[SpaceSectionOrder]


class SpacePublishRequest(BaseSchema):
    message: str | None = Field(default=None, max_length=SPACE_PUBLISH_MESSAGE_MAX)
    notify_members: bool = False
    # Draft item ids whose completion resets (M3 applies it). Unknown ids are ignored.
    reset_item_ids: list[str] = []


# ── Members ───────────────────────────────────────────────────────────────────


class SpaceJoinByCode(BaseSchema):
    code: str = Field(min_length=1, max_length=32)


class SpaceInvite(BaseSchema):
    """Invite an existing user by username or email."""

    identifier: str = Field(min_length=1, max_length=320)


class SpaceMemberRoleUpdate(BaseSchema):
    """OWNER is never stored on a member row (see `space_member`)."""

    role: Literal[SpaceRole.EDITOR, SpaceRole.VIEWER]


class SpaceMemberRead(BaseSchema):
    user_id: str
    username: str
    display_name: str | None
    role: SpaceRole
    status: MemberStatus
    joined_at: datetime | None
    created_at: datetime


# ── Progress and attempts ─────────────────────────────────────────────────────


class SpaceMembershipUpdate(BaseSchema):
    """The settings of the current user in a course."""

    include_in_srs: bool


class SpaceVisitRequest(BaseSchema):
    item_id: str


class SpaceAttemptStart(BaseSchema):
    """The exam of one attempt. `attempt_id` is None for an author preview (no rows, no limits)."""

    attempt_id: str | None
    test: TestReadStripped
    started_at: datetime | None
    # None = no timer.
    deadline_at: datetime | None
    # The server clock (UTC) when the response was made. The client uses it to correct its own clock
    # offset for the countdown.
    server_now: datetime
    # True when the attempt was already open (a reload or another device).
    resumed: bool = False


# ── Classrooms ────────────────────────────────────────────────────────────────


class ClassroomCourseCreate(_SpaceMetadata):
    """A new course inside a classroom. `section_id` is a draft section of the classroom (edit mode)."""

    section_id: str


class ClassroomCourseDuplicate(_SpaceMetadata):
    """Copy the published content of a standalone course of the current user into a classroom."""

    section_id: str
    source_id: str


class ClassroomSettingsRead(BaseSchema):
    """Owner only. The Class key itself is never returned."""

    feed_permission: FeedPermission
    ai_provider: AIProvider | None
    has_class_key: bool
    key_priority: KeyPriority
    key_scope: KeyScope
    # None = no cap.
    monthly_token_cap_per_student: int | None


class ClassroomSettingsUpdate(BaseSchema):
    """Only the sent fields change.

    `class_key`: send "" to remove the key. `monthly_token_cap_per_student`: null = no cap.
    """

    feed_permission: FeedPermission | None = None
    ai_provider: AIProvider | None = None
    class_key: str | None = Field(default=None, max_length=500)
    key_priority: KeyPriority | None = None
    key_scope: KeyScope | None = None
    monthly_token_cap_per_student: int | None = Field(default=None, ge=0)

    @field_validator("feed_permission", "key_priority", "key_scope", mode="before")
    @classmethod
    def _no_null(cls, value: object) -> object:
        return _reject_null(value)


class DueSoonItem(BaseSchema):
    """A classwork item due in the next 24 hours that the current student has not completed."""

    item_id: str
    kind: SpaceItemKind
    title: str
    due_at: datetime
    # Where the item is: the classroom itself, or one of its courses.
    space_id: str
    space_title: str
    classroom_id: str
