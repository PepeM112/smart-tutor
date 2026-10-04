"""Folder tools: list folders, create a folder, move notes and folders.

`create_folder` and `move_items` run without a confirmation card. They call the same service
functions as the Files page (`folder_service`, `note_service`), so tree locking, ownership,
cycle and name-conflict checks are the same.
"""

from __future__ import annotations

import logging
from functools import partial
from typing import TYPE_CHECKING

from fastapi import HTTPException
from pydantic import ValidationError

from app.crud import folder as folder_crud
from app.schemas.folder import FolderCreate, FolderUpdate
from app.services import folder_service, note_service
from app.services.assist_tools._helpers import location_label, plural, skip_reason, string_list
from app.services.assist_tools.types import ToolResult, ToolSpec

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")

# One move is one commit. Cap a call so a wrong model call can not run for minutes.
_MOVE_LIMIT = 100


def _optional_id(value: object) -> str | None:
    """A folder ID argument where null, "" and a missing key all mean "no folder" (the root)."""
    return str(value) if value else None


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


def list_folders(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    folders = folder_crud.list_by_user(db, user_id=current_user.id)
    if not folders:
        return ToolResult(output="No folders found.")
    lines = [f"Found {len(folders)} folder(s):"]
    folder_map = {f.id: f for f in folders}
    for f in folders:
        lines.append(f"- **{f.name}** (ID: `{f.id}`, location: {location_label(folder_map, f.parent_id)})")
    return ToolResult(output="\n".join(lines))


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


def create_folder(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    name = str(arguments.get("name", "")).strip()
    parent_id = _optional_id(arguments.get("parent_id"))
    if not name:
        return ToolResult(output="Error: name is required.")

    logger.info("create_folder: user=%s name=%r parent=%s", current_user.id, name, parent_id)
    try:
        data = FolderCreate(name=name, parent_id=parent_id)
    except ValidationError:
        return ToolResult(output="Error: the folder name is too long.")

    try:
        folder = folder_service.create_folder(db, current_user=current_user, data=data)
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        db.rollback()  # Release the tree lock (see execute_tool).
        # The model can fix a name clash by using the folder that already exists.
        return ToolResult(output=f"Error: {exc.detail}. Use list_folders to find it and reuse its ID.")

    folders = folder_service.load_folder_map(db, user_id=current_user.id, include_trashed=False)
    return ToolResult(
        output=(
            f"Folder created successfully!\n- **Name:** {folder.name}\n- **ID:** `{folder.id}`\n"
            f"- **Location:** {location_label(folders, folder.parent_id)}"
        )
    )


def move_items(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    if "target_folder_id" not in arguments:
        return ToolResult(output="Error: target_folder_id is required. Use null to move the items to the root.")
    target_id = _optional_id(arguments["target_folder_id"])
    note_ids = string_list(arguments.get("note_ids"))
    folder_ids = string_list(arguments.get("folder_ids"))
    if not note_ids and not folder_ids:
        return ToolResult(output="Error: give at least one ID in note_ids or folder_ids.")
    if len(note_ids) + len(folder_ids) > _MOVE_LIMIT:
        return ToolResult(output=f"Error: at most {_MOVE_LIMIT} items can be moved in one call.")

    logger.info(
        "move_items: user=%s notes=%d folders=%d target=%s", current_user.id, len(note_ids), len(folder_ids), target_id
    )
    if target_id is not None:
        # Fail the whole call at once (execute_tool shows the 404/403) when the target is bad.
        folder_service.get_live_folder_or_404(db, folder_id=target_id, current_user=current_user)

    # `update_folder` runs the cycle and name-conflict checks. An explicit `parent_id=None` moves to the root.
    folder_update = FolderUpdate(parent_id=target_id)
    note_skips = {
        nid: skip_reason(
            db, partial(note_service.move_note, db, note_id=nid, current_user=current_user, folder_id=target_id)
        )
        for nid in note_ids
    }
    folder_skips = {
        fid: skip_reason(
            db, partial(folder_service.update_folder, db, folder_id=fid, current_user=current_user, data=folder_update)
        )
        for fid in folder_ids
    }

    moved_notes = sum(reason is None for reason in note_skips.values())
    moved_folders = sum(reason is None for reason in folder_skips.values())
    skipped = [
        f"- {kind} `{item_id}`: {reason}"
        for kind, results in (("note", note_skips), ("folder", folder_skips))
        for item_id, reason in results.items()
        if reason is not None
    ]

    folders = folder_service.load_folder_map(db, user_id=current_user.id, include_trashed=False)
    destination = location_label(folders, target_id)
    head = (
        f"Moved {plural(moved_notes, 'note')} and {plural(moved_folders, 'folder')} to {destination}."
        if moved_notes + moved_folders
        else "No items were moved."
    )
    skipped_lines = [f"Skipped {len(skipped)}:", *skipped] if skipped else []
    return ToolResult(output="\n".join([head, *skipped_lines]))


# ---------------------------------------------------------------------------
# Specs
# ---------------------------------------------------------------------------

LIST_FOLDERS = ToolSpec(
    name="list_folders",
    description=(
        "List all the user's folders. Returns folder names, IDs and parent IDs. "
        "Use this to find a folder ID before creating a note in a specific folder."
    ),
    input_schema={
        "type": "object",
        "properties": {},
        "required": [],
    },
    handler=list_folders,
)

CREATE_FOLDER = ToolSpec(
    name="create_folder",
    description=(
        "Create a new, empty folder in the user's Files. "
        "Folder names must be unique among the folders in the same place. "
        "Use list_folders first to check whether the folder already exists and to find parent_id. "
        "To put notes in a new folder: find the notes (list_notes), create the folder with this tool, "
        "then call move_items with the new folder's ID (from this tool's result)."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Name of the new folder."},
            "parent_id": {
                "type": "string",
                "description": "ID of the folder to create it in. Omit to create it at the top level (root).",
            },
        },
        "required": ["name"],
    },
    handler=create_folder,
)

MOVE_ITEMS = ToolSpec(
    name="move_items",
    description=(
        "Move notes and/or folders into a target folder, or to the root of Files. "
        "Get IDs from list_notes / search_user_notes (notes) and list_folders (folders). "
        "If the target folder does not exist yet, create it first with create_folder. "
        "A folder cannot be moved into itself or into its own subfolders, and a name that is already "
        "used in the target place is skipped. The result says how many items moved and which were skipped."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "note_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IDs of the notes to move.",
            },
            "folder_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IDs of the folders to move (their content moves with them).",
            },
            "target_folder_id": {
                "type": ["string", "null"],
                "description": "ID of the folder to move the items into. Use null to move them to the root.",
            },
        },
        "required": ["target_folder_id"],
    },
    handler=move_items,
)
