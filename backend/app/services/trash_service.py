"""Business logic for the Trash feature.

Soft-delete is done in folder_service / note_service.
This service handles listing, restoring, hard-deleting, and the lazy 30-day purge.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import reduce
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.constants import FOLDER_NAME_MAX, TRASH_RETENTION_DAYS
from app.crud import folder as folder_crud
from app.crud import note as note_crud
from app.models.folder import Folder
from app.models.note import Note
from app.schemas.folder import FileTree, FileTreeFolder, FileTreeNote, FolderCreate
from app.schemas.trash import TrashItemRead
from app.services import folder_service
from app.services.folder_paths import build_folder_path
from app.services.service_helpers import get_owned_or_404, is_trash_expired

if TYPE_CHECKING:
    from app.models.user import User


def _purge_expired(db: Session, *, user_id: str) -> None:
    """Hard-delete items trashed more than 30 days ago. Called lazily on GET /trash."""
    folder_crud.lock_tree(db, user_id=user_id)
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)
    # Only the top of each batch is deleted; FK CASCADE removes its sub-folders and notes.
    for folder in folder_crud.list_expired_top_folders(db, user_id=user_id, before=cutoff):
        # Same rule as "Delete forever": items of another batch survive with their orphan_path.
        folder_service.hard_delete_batch(db, folder=folder)
    note_crud.purge_old_notes(db, user_id=user_id, before=cutoff)
    db.commit()


def _original_path(names: list[str] | None) -> str | None:
    """Show a path from `build_folder_path` as "/A/B" (None = root, [] = "/")."""
    return None if names is None else "/" + "/".join(names)


def list_trash(db: Session, *, current_user: User) -> list[TrashItemRead]:
    """Return top-level trashed items after purging expired ones."""
    _purge_expired(db, user_id=current_user.id)

    items: list[TrashItemRead] = []
    # One query for all folders (trashed included, so the path shows even after a delete).
    folders = folder_service.load_folder_map(db, user_id=current_user.id, include_trashed=True)

    for folder in folder_crud.list_trashed_top_folders(db, user_id=current_user.id):
        folder_deleted_at = folder.deleted_at
        if folder_deleted_at is None:  # The query returns trashed rows only.
            continue
        sub_folders, note_count = folder_crud.count_batch_items(
            db, user_id=current_user.id, folder_id=folder.id, deleted_at=folder_deleted_at
        )
        original_path = _original_path(
            build_folder_path(folders, folder_id=folder.parent_id, orphan_path=folder.orphan_path)
        )
        items.append(
            TrashItemRead(
                kind="folder",
                id=folder.id,
                name=folder.name,
                deleted_at=folder_deleted_at,
                original_path=original_path,
                folder_count=sub_folders,
                note_count=note_count,
            )
        )

    for note in note_crud.list_trashed_top_notes(db, user_id=current_user.id):
        note_deleted_at = note.deleted_at
        if note_deleted_at is None:  # The query returns trashed rows only.
            continue
        original_path = _original_path(
            build_folder_path(folders, folder_id=note.folder_id, orphan_path=note.orphan_path)
        )
        items.append(
            TrashItemRead(
                kind="note",
                id=note.id,
                name=note.title,
                deleted_at=note_deleted_at,
                original_path=original_path,
                folder_count=0,
                note_count=0,
            )
        )

    items.sort(key=lambda x: x.deleted_at, reverse=True)
    return items


def _get_trashed_folder_or_404(db: Session, *, folder_id: str, current_user: User) -> Folder:
    folder = get_owned_or_404(
        db, fetch=folder_crud.get_by_id, id=folder_id, current_user=current_user, entity_name="Folder"
    )
    # An expired item is gone, even if the purge has not run yet.
    if folder.deleted_at is None or is_trash_expired(folder.deleted_at):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found in Trash")
    return folder


def _get_trashed_note_or_404(db: Session, *, note_id: str, current_user: User) -> Note:
    note = get_owned_or_404(db, fetch=note_crud.get_by_id, id=note_id, current_user=current_user, entity_name="Note")
    if note.deleted_at is None or is_trash_expired(note.deleted_at):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found in Trash")
    return note


def get_batch_tree(db: Session, *, folder_id: str, current_user: User) -> FileTree:
    """Return the folders and notes that were trashed together with a trashed folder.

    Flat lists like `GET /folders/tree`, so the client builds the tree. The result holds the
    descendants only (not the folder itself): the direct children have `parent_id == folder_id`.
    Items of other batches inside the folder are not part of it. They are listed in Trash on
    their own. Any trashed folder works, so a sub-folder of a batch gives its part of the tree.
    """
    folder = _get_trashed_folder_or_404(db, folder_id=folder_id, current_user=current_user)
    batch_ts = folder.deleted_at
    if batch_ts is None:  # `_get_trashed_folder_or_404` allows trashed folders only.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found in Trash")

    batch_folders = sorted(
        (f for f in folder_crud.list_batch_folders(db, folder=folder) if f.id != folder.id),
        key=lambda f: f.name.lower(),
    )
    note_rows = note_crud.list_batch_tree_notes(
        db,
        user_id=current_user.id,
        folder_ids=[folder.id, *(f.id for f in batch_folders)],
        deleted_at=batch_ts,
    )
    return FileTree(
        folders=[FileTreeFolder.model_validate(f) for f in batch_folders],
        notes=[FileTreeNote.model_validate(row) for row in note_rows],
    )


_RESTORE_SUFFIX = " (restored)"
# Max base length that leaves room for the longest fixed suffix.
_MAX_BASE_LEN = FOLDER_NAME_MAX - len(_RESTORE_SUFFIX)


def _resolve_restore_name(db: Session, *, name: str, parent_id: str | None, user_id: str, exclude_id: str) -> str:
    """Return a sibling-unique name by appending ' (restored)' or ' (2)', ' (3)'... if needed.

    The base name is truncated so that any candidate stays within FOLDER_NAME_MAX chars.
    Decision: rename silently on conflict rather than failing, because the old parent may have
    gained a sibling with the same name while the folder was in Trash.
    """
    if not folder_crud.sibling_name_exists(db, user_id=user_id, parent_id=parent_id, name=name, exclude_id=exclude_id):
        return name

    # Truncate the base so every candidate (base + suffix) fits within the column limit.
    base = name[:_MAX_BASE_LEN]

    candidate = f"{base}{_RESTORE_SUFFIX}"
    if not folder_crud.sibling_name_exists(
        db, user_id=user_id, parent_id=parent_id, name=candidate, exclude_id=exclude_id
    ):
        return candidate

    n = 2
    while True:
        candidate = f"{base} ({n})"
        if not folder_crud.sibling_name_exists(
            db, user_id=user_id, parent_id=parent_id, name=candidate, exclude_id=exclude_id
        ):
            return candidate
        n += 1


def _descend_orphan_path(db: Session, *, anchor_id: str | None, path: list[str], user_id: str) -> str | None:
    """Walk `path` down from `anchor_id`; reuse a live same-name folder or create one.

    Returns the id of the last folder (or `anchor_id` when `path` is empty).
    """

    def _step(parent_id: str | None, name: str) -> str:
        existing = folder_crud.get_live_child_by_name(db, user_id=user_id, parent_id=parent_id, name=name)
        if existing is not None:
            return existing.id
        return folder_crud.create(db, user_id=user_id, data=FolderCreate(name=name, parent_id=parent_id)).id

    return reduce(_step, path, anchor_id)


def _restore_ancestors(db: Session, *, parent_id: str | None, user_id: str) -> str | None:
    """Bring back the trashed ancestors of an item, folder rows only. Return the new parent id.

    Walk up from `parent_id` over consecutive trashed folders until a live folder or root.
    Only the rows of those folders get `deleted_at = NULL`; their other contents stay in Trash.
    A folder that lost its own parent forever is put back through its `orphan_path`.
    """
    chain: list[Folder] = []  # nearest parent first, topmost last
    anchor: str | None = None  # live folder above the chain; None = root
    current_id, seen = parent_id, set[str]()
    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        ancestor = folder_crud.get_by_id(db, id=current_id)
        if ancestor is None:
            break
        if ancestor.deleted_at is None:
            anchor = ancestor.id
            break
        chain.append(ancestor)
        current_id = ancestor.parent_id

    # Restore from the top down. Each folder can clash with a live folder of its new parent,
    # for example after an orphan_path folder was reused, so every name is checked.
    for ancestor in reversed(chain):
        new_parent = _descend_orphan_path(db, anchor_id=anchor, path=ancestor.orphan_path or [], user_id=user_id)
        name = _resolve_restore_name(
            db, name=ancestor.name, parent_id=new_parent, user_id=user_id, exclude_id=ancestor.id
        )
        folder_crud.restore_row(db, folder=ancestor, name=name, parent_id=new_parent)
        anchor = ancestor.id
    return anchor


def _restore_location(db: Session, *, parent_id: str | None, orphan_path: list[str] | None, user_id: str) -> str | None:
    """Return the folder id where a restored item must go. It rebuilds the original path."""
    anchor = _restore_ancestors(db, parent_id=parent_id, user_id=user_id)
    return _descend_orphan_path(db, anchor_id=anchor, path=orphan_path or [], user_id=user_id)


def restore_folder(db: Session, *, folder_id: str, current_user: User) -> None:
    """Restore a folder + its same-batch items to the original location.

    Trashed ancestors are restored too (rows only). Folders deleted forever are recreated
    from `orphan_path` (a live same-name folder is reused). Conflict → rename.
    """
    folder_crud.lock_tree(db, user_id=current_user.id)
    folder = _get_trashed_folder_or_404(db, folder_id=folder_id, current_user=current_user)

    # A concurrent request can take the chosen name after the checks below: 409 in that case.
    with folder_service.sibling_conflict_as_409(db, name=folder.name, parent_id=folder.parent_id):
        effective_parent = _restore_location(
            db, parent_id=folder.parent_id, orphan_path=folder.orphan_path, user_id=current_user.id
        )
        name = _resolve_restore_name(
            db,
            name=folder.name,
            parent_id=effective_parent,
            user_id=current_user.id,
            exclude_id=folder.id,
        )
        folder_crud.relocate(db, folder=folder, name=name, parent_id=effective_parent)

        folder_crud.restore_folder_batch(db, folder=folder)
        db.commit()


def restore_note(db: Session, *, note_id: str, current_user: User) -> None:
    """Restore a standalone trashed note to the original folder.

    Trashed ancestors are restored too (rows only). Folders deleted forever are recreated
    from `orphan_path` (a live same-name folder is reused).
    """
    folder_crud.lock_tree(db, user_id=current_user.id)
    note = _get_trashed_note_or_404(db, note_id=note_id, current_user=current_user)

    # The ancestor rows can clash with a folder that a concurrent request created: 409 in that case.
    with folder_service.sibling_conflict_as_409(db, name=None, parent_id=note.folder_id):
        folder_id = _restore_location(
            db, parent_id=note.folder_id, orphan_path=note.orphan_path, user_id=current_user.id
        )
        note_crud.restore(db, note=note, folder_id=folder_id)
        db.commit()


def hard_delete_folder(db: Session, *, folder_id: str, current_user: User) -> None:
    """Permanently delete a trashed folder; FK cascade removes sub-folders and notes.

    Items of a different trash batch in the subtree are moved to the parent of this folder
    first, with their lost folder names saved in `orphan_path`. So the CASCADE does not
    remove them and restore can rebuild their path.
    """
    folder_crud.lock_tree(db, user_id=current_user.id)
    folder = _get_trashed_folder_or_404(db, folder_id=folder_id, current_user=current_user)
    folder_service.hard_delete_batch(db, folder=folder)
    db.commit()


def hard_delete_note(db: Session, *, note_id: str, current_user: User) -> None:
    """Permanently delete a trashed note."""
    folder_crud.lock_tree(db, user_id=current_user.id)
    note = _get_trashed_note_or_404(db, note_id=note_id, current_user=current_user)
    note_crud.delete(db, note=note)
    db.commit()


def empty_trash(db: Session, *, current_user: User) -> None:
    """Hard-delete all trashed folders and notes for the user.

    Two bulk DELETEs: trashed notes first, then trashed folders (FK CASCADE removes their
    sub-rows). No live item can be lost: live items never sit under a trashed folder, so the
    cascade only reaches rows that are trashed too, and those are all deleted here anyway.
    The tree lock keeps that true while this runs: no create, move or restore can run at the same time.
    """
    folder_crud.lock_tree(db, user_id=current_user.id)
    note_crud.delete_all_trashed(db, user_id=current_user.id)
    folder_crud.delete_all_trashed(db, user_id=current_user.id)
    db.commit()
