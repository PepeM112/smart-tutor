"""Trash endpoints — list, restore, hard-delete, empty."""

from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.folder import FileTree
from app.schemas.trash import TrashItemRead, TrashKind
from app.services import trash_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[TrashItemRead])
def list_(db: DbSession, current_user: CurrentUser) -> list[TrashItemRead]:
    """Return top-level trashed items. Lazily purges items older than 30 days first."""
    return trash_service.list_trash(db, current_user=current_user)


@router.get("/folders/{folder_id}/tree", response_model=FileTree)
def folder_tree(folder_id: str, db: DbSession, current_user: CurrentUser) -> FileTree:
    """Return the items that were trashed together with this folder, as flat lists."""
    return trash_service.get_batch_tree(db, folder_id=folder_id, current_user=current_user)


@router.post("/{kind}/{item_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore(kind: TrashKind, item_id: str, db: DbSession, current_user: CurrentUser) -> None:
    """Restore a trashed item and all items in the same delete batch."""
    if kind == "folder":
        trash_service.restore_folder(db, folder_id=item_id, current_user=current_user)
    else:
        trash_service.restore_note(db, note_id=item_id, current_user=current_user)


@router.delete("/{kind}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete(kind: TrashKind, item_id: str, db: DbSession, current_user: CurrentUser) -> None:
    """Permanently delete a trashed item."""
    if kind == "folder":
        trash_service.hard_delete_folder(db, folder_id=item_id, current_user=current_user)
    else:
        trash_service.hard_delete_note(db, note_id=item_id, current_user=current_user)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def empty(db: DbSession, current_user: CurrentUser) -> None:
    """Permanently delete all trashed items for the current user."""
    trash_service.empty_trash(db, current_user=current_user)
