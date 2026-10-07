"""Schemas for the Trash feature."""

from datetime import datetime
from typing import Literal

from app.schemas.base import BaseSchema
from app.schemas.folder import FileTreeFolder, FileTreeNote

TrashKind = Literal["folder", "note"]


class TrashItemRead(BaseSchema):
    """One top-level entry in the user's Trash list.

    Top-level means the item's parent is live (or has a different deleted_at),
    so it represents a distinct delete action.
    """

    kind: TrashKind
    id: str
    # name (folder) or title (note) — unified as `name` for the UI
    name: str
    deleted_at: datetime
    # Human-readable location of the item before it was trashed.
    original_path: str | None
    # For folders: how many sub-items were trashed in the same batch.
    # Descendant folders only, without the folder itself.
    folder_count: int
    note_count: int


class TrashTreeFolder(FileTreeFolder):
    """Trashed folder record. `deleted_at` is the key of its delete batch."""

    deleted_at: datetime


class TrashTreeNote(FileTreeNote):
    """Trashed note record. `deleted_at` is the key of its delete batch."""

    deleted_at: datetime


class TrashTree(BaseSchema):
    """All trashed folders and notes of the user as flat lists (for client-side search)."""

    folders: list[TrashTreeFolder]
    notes: list[TrashTreeNote]
