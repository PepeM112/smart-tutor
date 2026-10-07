from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.constants import FOLDER_NAME_MAX
from app.schemas.base import BaseSchema


def _strip_name(v: object) -> object:
    """Strip the whitespace of a name and reject an empty result. Other types go to Pydantic."""
    if not isinstance(v, str):
        return v
    stripped = v.strip()
    if not stripped:
        raise ValueError("name cannot be empty")
    return stripped


class FolderBase(BaseSchema):
    name: str = Field(min_length=1, max_length=FOLDER_NAME_MAX)


class FolderCreate(FolderBase):
    parent_id: str | None = None

    # Only on input: `FolderRead` inherits the base and must not reject names that are already stored.
    @field_validator("name", mode="before")
    @classmethod
    def _strip_folder_name(cls, v: object) -> object:
        return _strip_name(v)


class FolderUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=FOLDER_NAME_MAX)
    parent_id: str | None = None  # Only applied when sent; an explicit null moves the folder to root.

    @field_validator("name", mode="before")
    @classmethod
    def _clean_name(cls, v: object) -> object:
        """Explicit null for `name` is not allowed (the column is NOT NULL). Else strip it."""
        if v is None:
            raise ValueError("name cannot be null")
        return _strip_name(v)


class FolderRead(FolderBase):
    id: str
    user_id: str
    parent_id: str | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class FileTreeFolder(BaseSchema):
    """Light folder record for the full file-tree response."""

    id: str
    name: str
    parent_id: str | None
    updated_at: datetime


class FileTreeNote(BaseSchema):
    """Light note record for the full file-tree response (no content)."""

    id: str
    title: str
    folder_id: str | None
    updated_at: datetime
    is_favorite: bool
    favorited_at: datetime | None


class FileTree(BaseSchema):
    """All non-trashed folders and notes of the user as flat lists."""

    folders: list[FileTreeFolder]
    notes: list[FileTreeNote]


class FolderDeleteResult(BaseSchema):
    """What a folder delete did: moved to Trash, or removed at once (an empty folder)."""

    outcome: Literal["trashed", "deleted"]
