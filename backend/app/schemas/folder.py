from datetime import datetime

from pydantic import Field, field_validator

from app.core.constants import FOLDER_NAME_MAX
from app.schemas.base import BaseSchema


class FolderBase(BaseSchema):
    name: str = Field(min_length=1, max_length=FOLDER_NAME_MAX)


class FolderCreate(FolderBase):
    parent_id: str | None = None


class FolderUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=FOLDER_NAME_MAX)
    parent_id: str | None = None  # None means "not sent"; use explicit sentinel if needed

    @field_validator("name", mode="before")
    @classmethod
    def _reject_null_name(cls, v: object) -> object:
        """Explicit null for `name` is not allowed — the column is NOT NULL."""
        if v is None:
            raise ValueError("name cannot be null")
        return v


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


class FileTree(BaseSchema):
    """All non-trashed folders and notes of the user as flat lists."""

    folders: list[FileTreeFolder]
    notes: list[FileTreeNote]


class FolderDeletePreview(BaseSchema):
    """Recursive counts shown in the delete confirmation dialog."""

    folder_count: int
    note_count: int
