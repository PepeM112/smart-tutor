from datetime import datetime

from pydantic import Field

from app.schemas.base import BaseSchema
from app.schemas.note import NoteRead


class FolderBase(BaseSchema):
    name: str = Field(min_length=1, max_length=100)


class FolderCreate(FolderBase):
    parent_id: str | None = None


class FolderUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    parent_id: str | None = None  # None means "not sent"; use explicit sentinel if needed


class FolderRead(FolderBase):
    id: str
    user_id: str
    parent_id: str | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class FolderContents(BaseSchema):
    """Subfolders and notes inside a folder (or the root when folder_id is omitted)."""

    folders: list[FolderRead]
    notes: list[NoteRead]


class FolderDeletePreview(BaseSchema):
    """Recursive counts shown in the delete confirmation dialog."""

    folder_count: int
    note_count: int
