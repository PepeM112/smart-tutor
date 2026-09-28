"""Business logic for Folder management.

Ownership checks, cycle detection, and sibling-name uniqueness all live here.
The CRUD layer does only atomic DB operations.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.crud import folder as folder_crud
from app.models.folder import Folder
from app.models.user import User
from app.schemas.folder import FolderContents, FolderCreate, FolderDeletePreview, FolderRead, FolderUpdate


def _get_owned_folder_or_404(db: Session, *, folder_id: str, current_user: User) -> Folder:
    """Fetch a LIVE folder and verify it belongs to the current user.

    Raises 404 for missing, trashed, or other-user folders (403 for the last case).
    """
    folder = folder_crud.get_by_id(db, id=folder_id)
    if folder is None or folder.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if folder.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return folder


def _assert_no_sibling_conflict(
    db: Session,
    *,
    user_id: str,
    parent_id: str | None,
    name: str,
    exclude_id: str | None = None,
) -> None:
    if folder_crud.sibling_name_exists(db, user_id=user_id, parent_id=parent_id, name=name, exclude_id=exclude_id):
        # The UI already shows where the user is, so do not expose the parent ULID.
        parent_label = "this folder" if parent_id else "the root"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A folder named '{name}' already exists in {parent_label}",
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


def get_contents(db: Session, *, current_user: User, folder_id: str | None) -> FolderContents:
    """Return subfolders and notes for a folder (or root when folder_id is None)."""
    if folder_id is not None:
        _get_owned_folder_or_404(db, folder_id=folder_id, current_user=current_user)

    folders = folder_crud.list_subfolders(db, user_id=current_user.id, parent_id=folder_id)
    notes = folder_crud.list_notes_in_folder(db, user_id=current_user.id, folder_id=folder_id)

    return FolderContents(
        folders=[FolderRead.model_validate(f) for f in folders],
        notes=list(notes),
    )


def create_folder(db: Session, *, current_user: User, data: FolderCreate) -> Folder:
    if data.parent_id is not None:
        _get_owned_folder_or_404(db, folder_id=data.parent_id, current_user=current_user)

    _assert_no_sibling_conflict(db, user_id=current_user.id, parent_id=data.parent_id, name=data.name)

    folder = folder_crud.create(db, user_id=current_user.id, data=data)
    db.commit()
    db.refresh(folder)
    return folder


def update_folder(db: Session, *, folder_id: str, current_user: User, data: FolderUpdate) -> Folder:
    folder = _get_owned_folder_or_404(db, folder_id=folder_id, current_user=current_user)

    # Determine effective target parent (after the update).
    new_parent_id = data.parent_id if "parent_id" in data.model_fields_set else folder.parent_id
    new_name = data.name if data.name is not None else folder.name

    if "parent_id" in data.model_fields_set and data.parent_id is not None:
        _get_owned_folder_or_404(db, folder_id=data.parent_id, current_user=current_user)
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

    updated = folder_crud.update(db, folder=folder, data=data)
    db.commit()
    db.refresh(updated)
    return updated


def get_delete_preview(db: Session, *, folder_id: str, current_user: User) -> FolderDeletePreview:
    _get_owned_folder_or_404(db, folder_id=folder_id, current_user=current_user)
    # Count only live items so the confirmation shows what will actually be trashed.
    folder_count, note_count = folder_crud.count_live_descendants(db, folder_id=folder_id)
    # Include the folder itself.
    return FolderDeletePreview(folder_count=folder_count + 1, note_count=note_count)


def delete_folder(db: Session, *, folder_id: str, current_user: User) -> None:
    """Soft-delete a folder and all its live descendants + their notes as one batch."""
    _get_owned_folder_or_404(db, folder_id=folder_id, current_user=current_user)
    now = datetime.now(timezone.utc)
    folder_crud.soft_delete_cascade(db, folder_id=folder_id, now=now)
    db.commit()
