"""Trash tools: list the Trash and restore items from it.

`restore_from_trash` asks the user to confirm first. There is no tool to delete forever:
that stays in the UI.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import partial
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException, status

from app.crud import folder as folder_crud
from app.crud import note as note_crud
from app.services import folder_service, trash_service
from app.services.assist_tools._helpers import location_label, note_label, plural, skip_reason
from app.services.assist_tools.types import ToolResult, ToolSpec

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")

_LIST_LIMIT = 50
_CONFIRM_ITEM_LIMIT = 10


def _deleted_ago(deleted_at: datetime, *, now: datetime) -> str:
    seconds = int((now - deleted_at).total_seconds())
    if seconds < 3600:
        return f"{max(seconds // 60, 1)} min ago"
    if seconds < 86400:
        return f"{seconds // 3600} h ago"
    return f"{seconds // 86400} d ago"


def _path_label(original_path: str | None) -> str:
    """Show the "/A/B" path of the Trash list the way the app UI does: "Files > A > B".

    A folder name that contains "/" is shown as two folders. The trash schema only has the
    joined string, and such a name is rare, so this is accepted.
    """
    if original_path is None:
        return "unknown location"
    return " > ".join(["Files", *(part for part in original_path.split("/") if part)])


def _parse_items(raw: object) -> list[tuple[str, str]]:
    """The `(kind, id)` pairs of the `items` argument, without duplicates, in order."""
    if not isinstance(raw, list):
        return []
    pairs = [(str(i.get("kind", "")), str(i.get("id", ""))) for i in raw if isinstance(i, dict)]
    return list(dict.fromkeys(pairs))


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


def list_trash(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    items = trash_service.list_trash(db, current_user=current_user)
    if not items:
        return ToolResult(output="The Trash is empty.")

    now = datetime.now(timezone.utc)
    lines = [f"Found {len(items)} item(s) in Trash (newest first):"]
    for item in items[:_LIST_LIMIT]:
        contents = (
            f", with {plural(item.folder_count, 'subfolder')} and {plural(item.note_count, 'note')}"
            if item.kind == "folder"
            else ""
        )
        lines.append(
            f"- {item.kind} **{note_label(item.name)}** (ID: `{item.id}`, was in: {_path_label(item.original_path)}, "
            f"deleted {_deleted_ago(item.deleted_at, now=now)}{contents})"
        )
    if len(items) > _LIST_LIMIT:
        lines.append(f"…and {len(items) - _LIST_LIMIT} more.")
    return ToolResult(output="\n".join(lines))


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


def _restore_one(db: Session, *, current_user: User, kind: str, item_id: str) -> None:
    if kind == "folder":
        trash_service.restore_folder(db, folder_id=item_id, current_user=current_user)
    elif kind == "note":
        trash_service.restore_note(db, note_id=item_id, current_user=current_user)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind must be 'folder' or 'note'")


def restore_from_trash(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    items = _parse_items(arguments.get("items"))
    if not items:
        return ToolResult(output="Error: give at least one item with kind and id. Use list_trash to find them.")

    logger.info("restore_from_trash: user=%s items=%s", current_user.id, items)
    results = {
        (kind, item_id): skip_reason(partial(_restore_one, db, current_user=current_user, kind=kind, item_id=item_id))
        for kind, item_id in items
    }
    restored = [f"{kind} `{item_id}`" for (kind, item_id), reason in results.items() if reason is None]
    skipped = [f"- {kind} `{item_id}`: {reason}" for (kind, item_id), reason in results.items() if reason is not None]

    head = (
        f"Restored {len(restored)} of {len(items)} item(s): {', '.join(restored)}."
        if restored
        else "No items were restored."
    )
    skipped_lines = [f"Skipped {len(skipped)}:", *skipped] if skipped else []
    return ToolResult(output="\n".join([head, *skipped_lines]))


# ---------------------------------------------------------------------------
# Confirm card
# ---------------------------------------------------------------------------


def restore_from_trash_confirm_context(
    db: Session, *, current_user: User, arguments: dict[str, Any]
) -> dict[str, Any] | None:
    pairs = _parse_items(arguments.get("items"))
    # Folders with the trashed ones: the path of a trashed item can run through trashed folders.
    folders = folder_service.load_folder_map(db, user_id=current_user.id, include_trashed=True)

    def describe(kind: str, item_id: str) -> dict[str, str] | None:
        # Only trashed items of this user: a foreign or live ID shows nothing.
        if kind == "folder":
            folder = folder_crud.get_by_id(db, id=item_id)
            if folder is None or folder.user_id != current_user.id or folder.deleted_at is None:
                return None
            where = location_label(folders, folder.parent_id, folder.orphan_path)
            return {"kind": "folder", "name": folder.name, "detail": f"was in {where}"}
        if kind == "note":
            note = note_crud.get_by_id(db, id=item_id)
            if note is None or note.user_id != current_user.id or note.deleted_at is None:
                return None
            where = location_label(folders, note.folder_id, note.orphan_path)
            return {"kind": "note", "name": note_label(note.title), "detail": f"was in {where}"}
        return None

    items = [d for d in (describe(kind, item_id) for kind, item_id in pairs) if d is not None]
    if not items:
        return None
    return {
        "summary": f"Restore {plural(len(items), 'item')} from Trash",
        "items": items[:_CONFIRM_ITEM_LIMIT],
        "more_items": max(0, len(items) - _CONFIRM_ITEM_LIMIT),
    }


# ---------------------------------------------------------------------------
# Specs
# ---------------------------------------------------------------------------

LIST_TRASH = ToolSpec(
    name="list_trash",
    description=(
        "List what is in the user's Trash: deleted notes and folders, with their ID, the place they "
        "were deleted from, how long ago, and (for folders) how many items they hold. "
        "Use this when the user asks what is in the Trash or wants to get something back, "
        "then call restore_from_trash with the IDs the user wants. "
        "Deleting forever is not possible with a tool; the user does it in the Trash page."
    ),
    input_schema={
        "type": "object",
        "properties": {},
        "required": [],
    },
    handler=list_trash,
)

RESTORE_FROM_TRASH = ToolSpec(
    name="restore_from_trash",
    description=(
        "Restore notes and/or folders from the Trash to where they were deleted from. "
        "Requires user confirmation before executing. "
        "Use list_trash first to get the kind and ID of each item. "
        "Restoring a folder also brings back what was deleted with it. "
        "If the original place no longer exists, it is created again; if a name is taken, "
        "the restored item is renamed. The result says what was restored and what was skipped."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": ["folder", "note"]},
                        "id": {"type": "string", "description": "ID from list_trash."},
                    },
                    "required": ["kind", "id"],
                },
                "description": "The Trash items to restore.",
            },
        },
        "required": ["items"],
    },
    handler=restore_from_trash,
    requires_confirmation=True,
    confirm_context=restore_from_trash_confirm_context,
)
