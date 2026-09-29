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
from app.models.folder import Folder
from app.models.user import User
from app.schemas.folder import (
    FileTree,
    FileTreeFolder,
    FileTreeNote,
    FolderCreate,
    FolderDeletePreview,
    FolderRead,
    FolderUpdate,
)
from app.services.service_helpers import get_owned_or_404

_SIBLING_INDEX = "ix_folder_sibling_name"


def get_live_folder_or_404(db: Session, *, folder_id: str, current_user: User, for_update: bool = False) -> Folder:
    """Fetch a LIVE folder and verify it belongs to the current user.

    Raises 404 for missing or trashed folders, and 403 for folders of another user.
    `for_update` locks the row until the transaction ends (SELECT ... FOR UPDATE). Use it on a
    destination folder before you put an item in it: the trash cascade updates the rows of the
    folder and its descendants, so it waits for this lock (and the reverse). Then a live item
    can not end up under a folder that is trashed at the same time.
    """
    folder = get_owned_or_404(
        db,
        fetch=folder_crud.get_by_id_for_update if for_update else folder_crud.get_by_id,
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
    note_rows = folder_crud.list_tree_notes(db, user_id=current_user.id)

    return FileTree(
        # Rows expose the selected columns as attributes, so from_attributes validation maps them by name.
        folders=[FileTreeFolder.model_validate(row) for row in folder_rows],
        notes=[FileTreeNote.model_validate(row) for row in note_rows],
    )


def create_folder(db: Session, *, current_user: User, data: FolderCreate) -> Folder:
    if data.parent_id is not None:
        get_live_folder_or_404(db, folder_id=data.parent_id, current_user=current_user, for_update=True)

    _assert_no_sibling_conflict(db, user_id=current_user.id, parent_id=data.parent_id, name=data.name)

    with sibling_conflict_as_409(db, name=data.name, parent_id=data.parent_id):
        folder = folder_crud.create(db, user_id=current_user.id, data=data)
        db.commit()
    db.refresh(folder)
    return folder


def update_folder(db: Session, *, folder_id: str, current_user: User, data: FolderUpdate) -> Folder:
    folder = get_live_folder_or_404(db, folder_id=folder_id, current_user=current_user)

    # Determine effective target parent (after the update).
    new_parent_id = data.parent_id if "parent_id" in data.model_fields_set else folder.parent_id
    new_name = data.name if data.name is not None else folder.name

    if "parent_id" in data.model_fields_set and data.parent_id is not None:
        get_live_folder_or_404(db, folder_id=data.parent_id, current_user=current_user, for_update=True)
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


def get_delete_preview(db: Session, *, folder_id: str, current_user: User) -> FolderDeletePreview:
    get_live_folder_or_404(db, folder_id=folder_id, current_user=current_user)
    # Count only live items so the confirmation shows what will actually be trashed.
    folder_count, note_count = folder_crud.count_live_descendants(db, user_id=current_user.id, folder_id=folder_id)
    # Include the folder itself.
    return FolderDeletePreview(folder_count=folder_count + 1, note_count=note_count)


def delete_folder(db: Session, *, folder_id: str, current_user: User) -> None:
    """Soft-delete a folder and all its live descendants + their notes as one batch."""
    # Lock the folder first. The cascade updates the rows of the whole subtree, so it waits
    # for a concurrent move or create into that subtree (and the reverse).
    get_live_folder_or_404(db, folder_id=folder_id, current_user=current_user, for_update=True)
    now = datetime.now(timezone.utc)
    folder_crud.soft_delete_cascade(db, user_id=current_user.id, folder_id=folder_id, now=now)
    db.commit()
