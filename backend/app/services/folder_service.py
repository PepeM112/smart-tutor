"""Business logic for Folder management.

Ownership checks, cycle detection, and sibling-name uniqueness all live here.
The CRUD layer does only atomic DB operations.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import folder as folder_crud
from app.crud import note as note_crud
from app.models.folder import Folder
from app.models.user import User
from app.schemas.folder import (
    FileTree,
    FileTreeFolder,
    FileTreeNote,
    FolderCreate,
    FolderDeleteResult,
    FolderRead,
    FolderUpdate,
)
from app.services.folder_paths import build_orphan_path
from app.services.service_helpers import get_owned_or_404

_SIBLING_INDEX = "ix_folder_sibling_name"


def get_live_folder_or_404(db: Session, *, folder_id: str, current_user: User) -> Folder:
    """Fetch a LIVE folder and verify it belongs to the current user.

    Raises 404 for missing or trashed folders, and 403 for folders of another user.
    It does not lock a row. Before a write that uses the result (for example, to put an item in
    the folder), take `folder_crud.lock_tree` first: then no other tree write of the user can
    trash or move the folder between this check and the commit.
    """
    folder = get_owned_or_404(
        db,
        fetch=folder_crud.get_by_id,
        id=folder_id,
        current_user=current_user,
        entity_name="Folder",
    )
    if folder.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


def load_folder_map(db: Session, *, user_id: str, include_trashed: bool) -> dict[str, Folder]:
    """Load the folders of a user ONCE as `{id: Folder}`, to build many paths without more queries.

    Use it with `folder_paths.build_folder_path`. Pass `include_trashed=True` when the items
    can sit in (or under) trashed folders, as in the Trash list.
    """
    return {f.id: f for f in folder_crud.list_by_user(db, user_id=user_id, include_trashed=include_trashed)}


def _sibling_conflict_detail(name: str | None, parent_id: str | None) -> str:
    # The UI already shows where the user is, so do not expose the parent ULID.
    parent_label = "this folder" if parent_id else "the root"
    if name is None:
        return f"A folder with the same name already exists in {parent_label}"
    return f"A folder named '{name}' already exists in {parent_label}"


@contextmanager
def sibling_conflict_as_409(db: Session, *, name: str | None, parent_id: str | None) -> Iterator[None]:
    """Turn a violation of the sibling-name unique index into a 409.

    The pre-check in `_assert_no_sibling_conflict` gives the same answer in the normal case.
    This guard covers the race where two requests pass the pre-check at the same time.
    Other IntegrityErrors are re-raised. Wrap the code that flushes or commits.
    """
    try:
        yield
    except IntegrityError as e:
        constraint = getattr(getattr(e.orig, "diag", None), "constraint_name", None)
        if constraint != _SIBLING_INDEX and _SIBLING_INDEX not in str(e.orig):
            raise
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=_sibling_conflict_detail(name, parent_id)
        ) from e


def _assert_no_sibling_conflict(
    db: Session,
    *,
    user_id: str,
    parent_id: str | None,
    name: str,
    exclude_id: str | None = None,
) -> None:
    if folder_crud.sibling_name_exists(db, user_id=user_id, parent_id=parent_id, name=name, exclude_id=exclude_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_sibling_conflict_detail(name, parent_id),
        )


def _assert_no_cycle(db: Session, *, folder_id: str, new_parent_id: str) -> None:
    """Raise 400 if moving folder_id under new_parent_id would create a cycle."""
    if folder_id == new_parent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A folder cannot be moved into itself",
        )
    desc_ids = folder_crud.get_descendant_ids(db, folder_id=folder_id)
    if new_parent_id in desc_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A folder cannot be moved into one of its own descendants",
        )


def list_folders(db: Session, *, current_user: User) -> list[FolderRead]:
    folders = folder_crud.list_by_user(db, user_id=current_user.id)
    return [FolderRead.model_validate(f) for f in folders]


def get_tree(db: Session, *, current_user: User) -> FileTree:
    """Return all non-trashed folders and notes of the user as two flat lists."""
    folder_rows = folder_crud.list_tree_folders(db, user_id=current_user.id)
    note_rows = note_crud.list_tree_notes(db, user_id=current_user.id)

    return FileTree(
        # Rows expose the selected columns as attributes, so from_attributes validation maps them by name.
        folders=[FileTreeFolder.model_validate(row) for row in folder_rows],
        notes=[FileTreeNote.model_validate(row) for row in note_rows],
    )


def create_folder(db: Session, *, current_user: User, data: FolderCreate) -> Folder:
    folder_crud.lock_tree(db, user_id=current_user.id)
    if data.parent_id is not None:
        get_live_folder_or_404(db, folder_id=data.parent_id, current_user=current_user)

    _assert_no_sibling_conflict(db, user_id=current_user.id, parent_id=data.parent_id, name=data.name)

    with sibling_conflict_as_409(db, name=data.name, parent_id=data.parent_id):
        folder = folder_crud.create(db, user_id=current_user.id, data=data)
        db.commit()
    db.refresh(folder)
    return folder


def update_folder(db: Session, *, folder_id: str, current_user: User, data: FolderUpdate) -> Folder:
    folder_crud.lock_tree(db, user_id=current_user.id)
    folder = get_live_folder_or_404(db, folder_id=folder_id, current_user=current_user)

    # Determine effective target parent (after the update).
    new_parent_id = data.parent_id if "parent_id" in data.model_fields_set else folder.parent_id
    new_name = data.name if data.name is not None else folder.name

    if "parent_id" in data.model_fields_set and data.parent_id is not None:
        get_live_folder_or_404(db, folder_id=data.parent_id, current_user=current_user)
        _assert_no_cycle(db, folder_id=folder_id, new_parent_id=data.parent_id)

    # Check sibling uniqueness only when name or parent changes.
    name_or_parent_changing = data.name is not None or "parent_id" in data.model_fields_set
    if name_or_parent_changing:
        _assert_no_sibling_conflict(
            db,
            user_id=current_user.id,
            parent_id=new_parent_id,
            name=new_name,
            exclude_id=folder_id,
        )

    with sibling_conflict_as_409(db, name=new_name, parent_id=new_parent_id):
        updated = folder_crud.update(db, folder=folder, data=data)
        db.commit()
    db.refresh(updated)
    return updated


def detach_other_batches(db: Session, *, folder: Folder) -> None:
    """Move the items of other trash batches out of `folder`'s subtree before a hard delete.

    FK CASCADE deletes every row under `folder`. Items of a *different* batch (another
    `deleted_at`) must survive, so each one moves to the parent of `folder` (it survives; it
    can be live, trashed or root). The names of the deleted folders between that parent and
    the item go into `orphan_path`, so restore can rebuild the original place.

    `folder` can also be LIVE (`deleted_at` is None, an empty folder that is deleted at once).
    Then its batch is the live folders of the subtree, and every trashed item inside is "other".
    """
    batch = {f.id: f for f in folder_crud.list_batch_folders(db, folder=folder)}
    batch_ids = list(batch)
    # Only folders of this batch are deleted. An item of another batch keeps its own children:
    # it moves only when its parent is in this batch.
    orphan_folders = folder_crud.list_children_outside_batch(db, parent_ids=batch_ids, batch_ts=folder.deleted_at)
    orphan_notes = note_crud.list_in_folders_outside_batch(
        db, user_id=folder.user_id, folder_ids=batch_ids, batch_ts=folder.deleted_at
    )

    def _new_path(parent_id: str | None, existing: list[str] | None) -> list[str]:
        return build_orphan_path(batch, top_id=folder.id, start_id=parent_id or folder.id, existing=existing)

    for child in orphan_folders:
        new_path = _new_path(child.parent_id, child.orphan_path)
        folder_crud.reparent(db, folder=child, parent_id=folder.parent_id, orphan_path=new_path)
    for note in orphan_notes:
        new_path = _new_path(note.folder_id, note.orphan_path)
        note_crud.reparent(db, note=note, folder_id=folder.parent_id, orphan_path=new_path)


def hard_delete_batch(db: Session, *, folder: Folder) -> None:
    """Delete the batch of `folder` forever. Items of other batches in the subtree survive.

    Used by "Delete forever", the 30-day purge and the delete of an empty live folder.
    """
    detach_other_batches(db, folder=folder)
    folder_crud.hard_delete(db, folder=folder)


def delete_folder(db: Session, *, folder_id: str, current_user: User) -> FolderDeleteResult:
    """Delete a folder. Empty → forever. Else soft-delete it and its live descendants as one batch.

    A folder with no live sub-folders and no live notes has nothing to restore, so Trash would
    only hold a name. The client gets the outcome, to show the right message and an Undo that
    creates the folder again.
    """
    # The tree lock makes the cascade wait for a concurrent move or create into the subtree
    # (and the reverse), so no live item can end up under a trashed folder.
    folder_crud.lock_tree(db, user_id=current_user.id)
    folder = get_live_folder_or_404(db, folder_id=folder_id, current_user=current_user)

    folder_count, note_count = folder_crud.count_live_descendants(db, user_id=current_user.id, folder_id=folder_id)
    if (folder_count, note_count) == (0, 0):
        # Trashed items of earlier batches can still sit inside: they must survive the CASCADE.
        hard_delete_batch(db, folder=folder)
        db.commit()
        return FolderDeleteResult(outcome="deleted")

    now = datetime.now(timezone.utc)
    folder_crud.soft_delete_cascade(db, user_id=current_user.id, folder_id=folder_id, now=now)
    db.commit()
    return FolderDeleteResult(outcome="trashed")
