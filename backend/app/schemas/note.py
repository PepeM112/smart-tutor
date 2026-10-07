from datetime import datetime

from pydantic import Field, field_validator

from app.core.enums import NoteLength
from app.schemas.base import BaseSchema

NOTE_CONTENT_MAX_CHARS = 50_000
NOTE_MAX_TAGS = 10
NOTE_TAG_MAX_CHARS = 25


def _normalize_tags(tags: list[str]) -> list[str]:
    """Trim, lowercase, drop empty tags and duplicates (first one wins), then check the limits."""
    cleaned = list(dict.fromkeys(tag.strip().lower() for tag in tags if tag.strip()))
    if len(cleaned) > NOTE_MAX_TAGS:
        raise ValueError(f"A note can have at most {NOTE_MAX_TAGS} tags")
    too_long = next((tag for tag in cleaned if len(tag) > NOTE_TAG_MAX_CHARS), None)
    if too_long is not None:
        raise ValueError(f"Tag '{too_long}' is longer than {NOTE_TAG_MAX_CHARS} characters")
    return cleaned


# Input limits live on Create/Update only. `NoteRead` inherits `NoteBase`, and a limit there
# would make older notes (or AI-generated ones) that are over it fail to serialize.
class NoteBase(BaseSchema):
    title: str = Field(max_length=200)
    content: str = ""
    tags: list[str] = []


class NoteCreate(NoteBase):
    content: str = Field(default="", max_length=NOTE_CONTENT_MAX_CHARS)
    folder_id: str | None = None

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, tags: list[str]) -> list[str]:
        return _normalize_tags(tags)


class NoteUpdate(BaseSchema):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, max_length=NOTE_CONTENT_MAX_CHARS)
    tags: list[str] | None = None
    # Always required. The service checks it only when title/content/tags change;
    # a reindex-only PATCH skips the check.
    version: int
    # When true the endpoint schedules embedding reindex as a BackgroundTask.
    # Excluded from column updates by the CRUD layer.
    reindex: bool = False

    # `None` means "not sent" (the default). An explicit JSON `null` must not get through:
    # it would write NULL to a NOT NULL column (500), or JSON null to `tags`, which breaks
    # every later read of the note. It would also skip the version check.
    @field_validator("title", "content", "tags", mode="before")
    @classmethod
    def _reject_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field cannot be null; omit it to leave it unchanged")
        return value

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, tags: list[str] | None) -> list[str] | None:
        return None if tags is None else _normalize_tags(tags)


class NoteRead(NoteBase):
    id: str
    user_id: str
    folder_id: str | None
    is_indexed: bool
    is_favorite: bool
    favorited_at: datetime | None
    version: int
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NoteGenerate(BaseSchema):
    topic: str = Field(max_length=200)
    guidance: str | None = None
    length: NoteLength | None = None
    folder_id: str | None = None


class NoteChunkEdit(BaseSchema):
    full_text: str = Field(..., min_length=1, max_length=NOTE_CONTENT_MAX_CHARS)
    selected_text: str = Field(..., min_length=1, max_length=NOTE_CONTENT_MAX_CHARS)
    instructions: str = Field(..., min_length=1, max_length=2000)


class NoteChunkEditResponse(BaseSchema):
    edited_text: str


# Content search (`GET /notes/search`): the limits of the query text, shared by the endpoint and the service.
NOTE_SEARCH_MIN_CHARS = 3
NOTE_SEARCH_MAX_CHARS = 200


class NoteFavorite(BaseSchema):
    """Star or unstar a note (body of `PUT /notes/{id}/favorite`)."""

    is_favorite: bool


class NoteContentMatch(BaseSchema):
    """A note whose content matches a search, with a short text around the first hit."""

    id: str
    title: str
    folder_id: str | None
    snippet: str


class NoteMove(BaseSchema):
    """Move a note to a different folder. Pass null to move to root."""

    # No default: an empty body must be a 422, not a silent move to root.
    folder_id: str | None
