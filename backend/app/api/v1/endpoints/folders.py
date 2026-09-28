from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.folder import Folder
from app.models.user import User
from app.schemas.folder import FolderContents, FolderCreate, FolderDeletePreview, FolderRead, FolderUpdate
from app.services import folder_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=list[FolderRead])
def list_(db: DbSession, current_user: CurrentUser) -> list[FolderRead]:
    return folder_service.list_folders(db, current_user=current_user)


@router.get("/contents", response_model=FolderContents)
def contents(
    db: DbSession,
    current_user: CurrentUser,
    folder_id: Annotated[str | None, Query()] = None,
) -> FolderContents:
    """Return subfolders and notes for a folder. Omit folder_id for the root."""
    return folder_service.get_contents(db, current_user=current_user, folder_id=folder_id)


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create(data: FolderCreate, db: DbSession, current_user: CurrentUser) -> Folder:
    return folder_service.create_folder(db, current_user=current_user, data=data)


@router.get("/{folder_id}/delete-preview", response_model=FolderDeletePreview)
def delete_preview(folder_id: str, db: DbSession, current_user: CurrentUser) -> FolderDeletePreview:
    return folder_service.get_delete_preview(db, folder_id=folder_id, current_user=current_user)


@router.patch("/{folder_id}", response_model=FolderRead)
def update(folder_id: str, data: FolderUpdate, db: DbSession, current_user: CurrentUser) -> Folder:
    return folder_service.update_folder(db, folder_id=folder_id, current_user=current_user, data=data)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(folder_id: str, db: DbSession, current_user: CurrentUser) -> None:
    folder_service.delete_folder(db, folder_id=folder_id, current_user=current_user)
