"""Business logic for the Trash feature.

Soft-delete is done in folder_service / note_service.
This service handles listing, restoring, hard-deleting, and the lazy 30-day purge.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud import folder as folder_crud
from app.models.folder import Folder
from app.models.note import Note
from app.schemas.trash import TrashItemRead, TrashKind  # noqa: F401 (TrashKind re-exported)

if TYPE_CHECKING:
    from app.models.user import User

_TRASH_TTL_DAYS = 30


def _purge_expired(db: Session, *, user_id: str) -> None:
    """Hard-delete items trashed more than 30 days ago. Called lazily on GET /trash."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=_TRASH_TTL_DAYS)
    folder_crud.purge_old_folders(db, user_id=user_id, before=cutoff)
    folder_crud.purge_old_notes(db, user_id=user_id, before=cutoff)
    db.commit()


def _folder_path(db: Session, *, folder_id: str | None, user_id: str) -> str | None:
    """Return a human-readable path for a folder (trashed or live), or None for root."""
    if folder_id is None:
        return None
    # Use all folders (trashed included) so the path is shown even after a delete.
    all_folders: dict[str, Folder] = {
        f.id: f for f in db.scalars(select(Folder).where(Folder.user_id == user_id)).all()
    }
    parts: list[str] = []
    current_id: str | None = folder_id
    seen: set[str] = set()
    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        f = all_folders.get(current_id)
        if f is None:
            break
        parts.append(f.name)
        current_id = f.parent_id
    return "/" + "/".join(reversed(parts)) if parts else "/"


def list_trash(db: Session, *, current_user: User) -> list[TrashItemRead]:
    """Return top-level trashed items after purging expired ones."""
    _purge_expired(db, user_id=current_user.id)

    items: list[TrashItemRead] = []

    for folder in folder_crud.list_trashed_top_folders(db, user_id=current_user.id):
        sub_folders, note_count = folder_crud.count_batch_items(
            db,
            folder_id=folder.id,
            deleted_at=folder.deleted_at,  # type: ignore[arg-type]
        )
        original_path = _folder_path(db, folder_id=folder.parent_id, user_id=current_user.id)
        items.append(
            TrashItemRead(
                kind="folder",
                id=folder.id,
                name=folder.name,
                deleted_at=folder.deleted_at,  # type: ignore[arg-type]
                original_path=original_path,
                folder_count=sub_folders,
                note_count=note_count,
            )
        )

    for note in folder_crud.list_trashed_top_notes(db, user_id=current_user.id):
        original_path = _folder_path(db, folder_id=note.folder_id, user_id=current_user.id)
        items.append(
            TrashItemRead(
                kind="note",
                id=note.id,
                name=note.title,
                deleted_at=note.deleted_at,  # type: ignore[arg-type]
                original_path=original_path,
                folder_count=0,
                note_count=0,
            )
        )

    items.sort(key=lambda x: x.deleted_at, reverse=True)
    return items


def _get_trashed_folder_or_404(db: Session, *, folder_id: str, current_user: User) -> Folder:
    folder = folder_crud.get_by_id(db, id=folder_id)
    if folder is None or folder.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found in Trash")
    if folder.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return folder


def _get_trashed_note_or_404(db: Session, *, note_id: str, current_user: User) -> Note:
    note = db.scalars(select(Note).where(Note.id == note_id)).first()
    if note is None or note.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found in Trash")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return note


def _resolve_restore_name(db: Session, *, name: str, parent_id: str | None, user_id: str, exclude_id: str) -> str:
    """Return a sibling-unique name by appending ' (restored)' or ' (2)', ' (3)'... if needed.

    Decision: rename silently on conflict rather than failing, because the old parent may have
    gained a sibling with the same name while the folder was in Trash.
    """
    if not folder_crud.sibling_name_exists(db, user_id=user_id, parent_id=parent_id, name=name, exclude_id=exclude_id):
        return name

    candidate = f"{name} (restored)"
    if not folder_crud.sibling_name_exists(
        db, user_id=user_id, parent_id=parent_id, name=candidate, exclude_id=exclude_id
    ):
        return candidate

    n = 2
    while True:
        candidate = f"{name} ({n})"
        if not folder_crud.sibling_name_exists(
            db, user_id=user_id, parent_id=parent_id, name=candidate, exclude_id=exclude_id
        ):
            return candidate
        n += 1


def restore_folder(db: Session, *, folder_id: str, current_user: User) -> None:
    """Restore a folder + its same-batch items. Parent gone/trashed → root. Conflict → rename."""
    folder = _get_trashed_folder_or_404(db, folder_id=folder_id, current_user=current_user)

    # Fall back to root if the original parent is gone or still trashed.
    effective_parent: str | None = folder.parent_id
    if effective_parent is not None:
        parent_folder = folder_crud.get_by_id(db, id=effective_parent)
        if parent_folder is None or parent_folder.deleted_at is not None:
            effective_parent = None

    new_name = _resolve_restore_name(
        db,
        name=folder.name,
        parent_id=effective_parent,
        user_id=current_user.id,
        exclude_id=folder.id,
    )
    if new_name != folder.name:
        folder.name = new_name
    if effective_parent != folder.parent_id:
        folder.parent_id = effective_parent
    db.flush()

    folder_crud.restore_folder_batch(db, folder=folder)
    db.commit()


def restore_note(db: Session, *, note_id: str, current_user: User) -> None:
    """Restore a standalone trashed note. Parent gone/trashed → root."""
    note = _get_trashed_note_or_404(db, note_id=note_id, current_user=current_user)

    if note.folder_id is not None:
        parent_folder = folder_crud.get_by_id(db, id=note.folder_id)
        if parent_folder is None or parent_folder.deleted_at is not None:
            note.folder_id = None

    note.deleted_at = None
    db.commit()


def hard_delete_folder(db: Session, *, folder_id: str, current_user: User) -> None:
    """Permanently delete a trashed folder; FK cascade removes sub-folders and notes."""
    folder = _get_trashed_folder_or_404(db, folder_id=folder_id, current_user=current_user)
    db.delete(folder)
    db.commit()


def hard_delete_note(db: Session, *, note_id: str, current_user: User) -> None:
    """Permanently delete a trashed note."""
    note = _get_trashed_note_or_404(db, note_id=note_id, current_user=current_user)
    db.delete(note)
    db.commit()


def empty_trash(db: Session, *, current_user: User) -> None:
    """Hard-delete all trashed folders and notes for the user."""
    # Delete trashed folders first; FK CASCADE removes their note and sub-folder rows.
    for folder in db.scalars(
        select(Folder).where(Folder.user_id == current_user.id, Folder.deleted_at.is_not(None))
    ).all():
        db.delete(folder)

    # Delete remaining standalone trashed notes (those not under a trashed folder).
    for note in db.scalars(select(Note).where(Note.user_id == current_user.id, Note.deleted_at.is_not(None))).all():
        db.delete(note)

    db.commit()
