from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.core.constants import SPACE_TITLE_MAX
from app.core.enums import MemberStatus, SpaceItemKind, SpaceKind, SpaceRole, SpaceStatus, SpaceVisibility
from app.schemas.base import BaseSchema
from app.schemas.note import normalize_tags
from app.schemas.pagination import PaginatedResponse

SPACE_DESCRIPTION_MAX = 5000
SPACE_PUBLISH_MESSAGE_MAX = 2000


def _reject_null(value: object) -> object:
    """An explicit JSON null must not get through an optional update field (it would write NULL)."""
    if value is None:
        raise ValueError("Field cannot be null; omit it to leave it unchanged")
    return value


# ── Space ─────────────────────────────────────────────────────────────────────


class SpaceCreate(BaseSchema):
    title: str = Field(min_length=1, max_length=SPACE_TITLE_MAX)
    description: str = Field(default="", max_length=SPACE_DESCRIPTION_MAX)
    tags: list[str] = []
    visibility: SpaceVisibility = SpaceVisibility.PRIVATE

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, tags: list[str]) -> list[str]:
        return normalize_tags(tags)


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


class SpaceSummary(BaseSchema):
    """A space in a list (my courses, catalog, invitations)."""

    id: str
    kind: SpaceKind
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


class SpaceItemRead(BaseSchema):
    id: str
    section_id: str
    kind: SpaceItemKind
    note_id: str | None
    test_id: str | None
    position: int
    # The title of the content. For a draft item with an edited twin, the title of the twin.
    title: str
    is_draft: bool
    draft_of_id: str | None
    # Draft items only: the content is new or has an edited twin (it changes on publish).
    has_changes: bool = False


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


class SpaceDuplicateRequest(BaseSchema):
    """The metadata of the new course. The dialog fills it with the values of the source."""

    title: str = Field(min_length=1, max_length=SPACE_TITLE_MAX)
    description: str = Field(default="", max_length=SPACE_DESCRIPTION_MAX)
    tags: list[str] = []

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, tags: list[str]) -> list[str]:
        return normalize_tags(tags)


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
