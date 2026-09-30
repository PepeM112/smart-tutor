"""Schemas for the Trash feature."""

from datetime import datetime
from typing import Literal

from app.schemas.base import BaseSchema

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
    # Descendant folders only, without the folder itself. `FolderDeletePreview.folder_count`
    # includes the folder itself. Do not change either: the frontend relies on both.
    folder_count: int
    note_count: int
