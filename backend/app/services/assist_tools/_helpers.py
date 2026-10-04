"""Small helpers shared by the tool modules."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import HTTPException

from app.services.folder_paths import build_folder_path

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping

    from sqlalchemy.orm import Session

    from app.models.folder import Folder

# Result sizes for list tools. A tool output goes back to the model, so keep it short.
LIST_LIMIT = 20
SEARCH_LIMIT = 15


def note_label(title: str | None) -> str:
    """Title for tool output. A blank title would give `****` in the markdown."""
    return (title or "").strip() or "Untitled"


def location_label(folders: Mapping[str, Folder], folder_id: str | None, orphan_path: list[str] | None = None) -> str:
    """Where an item is, as the user sees it in the app: "Files" or "Files > A > B" (not "/A/B").

    `orphan_path` is for trashed items: names of folders that were deleted forever below `folder_id`.
    """
    return " > ".join(["Files", *(build_folder_path(folders, folder_id=folder_id, orphan_path=orphan_path) or [])])


def plural(count: int, noun: str) -> str:
    """ "1 note" / "3 notes"."""
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def string_list(value: object) -> list[str]:
    """The non-empty strings of a list argument, without duplicates, in order. Anything else gives []."""
    if not isinstance(value, list):
        return []
    return list(dict.fromkeys(str(v) for v in value if v))


def confirm_summary(*lines: tuple[str, str | None]) -> dict[str, Any] | None:
    """Confirm card data for a tool without a special layout: `{key, value}` lines.

    The frontend translates `key` (`assist.confirm.fields.<key>`), so keys are stable ids and
    `value` is the data. Empty values are dropped. No lines gives None (no card details).
    """
    items = [{"key": key, "value": value} for key, value in lines if value]
    return {"summary": items} if items else None


def clip(text: object, limit: int = 160) -> str:
    """Free text of the model (instructions, guidance) cut to one short line for a confirm card."""
    flat = " ".join(str(text or "").split())
    return flat if len(flat) <= limit else f"{flat[: limit - 1]}…"


def names_label(names: list[str], limit: int = 5) -> str | None:
    """ "A, B, C" or "A, B, C +4 more". None for an empty list."""
    if not names:
        return None
    shown = ", ".join(names[:limit])
    return shown if len(names) <= limit else f"{shown} +{len(names) - limit}"


def skip_reason(db: Session, action: Callable[[], object]) -> str | None:
    """Run one step of a batch tool. Return None if it worked, or why it was skipped.

    A service refuses with `HTTPException` (not found, not yours, name conflict, cycle). In a
    batch that must skip the one item and go on, not fail the whole call. The services commit
    each step that works, so the rollback only drops the refused step and releases its tree lock.
    """
    try:
        action()
    except HTTPException as exc:
        db.rollback()
        return str(exc.detail)
    return None
