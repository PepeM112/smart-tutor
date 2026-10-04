from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.models.folder import Folder
from app.schemas.folder import FileTree, FolderCreate, FolderDeleteResult, FolderRead, FolderUpdate
from app.services import folder_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[FolderRead])
def list_(db: DbSession, current_user: CurrentUser) -> list[FolderRead]:
    return folder_service.list_folders(db, current_user=current_user)


@router.get("/tree", response_model=FileTree)
def tree(db: DbSession, current_user: CurrentUser) -> FileTree:
    """Return all non-trashed folders and notes as two flat lists. The client builds the tree."""
    return folder_service.get_tree(db, current_user=current_user)


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create(data: FolderCreate, db: DbSession, current_user: CurrentUser) -> Folder:
    return folder_service.create_folder(db, current_user=current_user, data=data)


@router.patch("/{folder_id}", response_model=FolderRead)
def update(folder_id: str, data: FolderUpdate, db: DbSession, current_user: CurrentUser) -> Folder:
    return folder_service.update_folder(db, folder_id=folder_id, current_user=current_user, data=data)


@router.delete("/{folder_id}", response_model=FolderDeleteResult)
def delete(folder_id: str, db: DbSession, current_user: CurrentUser) -> FolderDeleteResult:
    """Delete a folder: an empty one is removed for good, any other goes to Trash."""
    return folder_service.delete_folder(db, folder_id=folder_id, current_user=current_user)
