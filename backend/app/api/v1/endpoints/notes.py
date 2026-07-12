from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.note import Note
from app.models.user import User
from app.schemas.note import NoteCreate, NoteGenerate, NoteRead, NoteUpdate
from app.services import note_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=list[NoteRead])
def list_(db: DbSession, current_user: CurrentUser) -> list[Note]:
    return note_service.list_notes(db, current_user=current_user)


@router.post("/generate", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def generate(data: NoteGenerate, db: DbSession, current_user: CurrentUser) -> Note:
    return note_service.generate_note(db, current_user=current_user, data=data)


@router.get("/{note_id}", response_model=NoteRead)
def get(note_id: str, db: DbSession, current_user: CurrentUser) -> Note:
    return note_service.get_note(db, note_id=note_id, current_user=current_user)


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create(data: NoteCreate, db: DbSession, current_user: CurrentUser) -> Note:
    return note_service.create_note(db, current_user=current_user, data=data)


@router.patch("/{note_id}", response_model=NoteRead)
def update(note_id: str, data: NoteUpdate, db: DbSession, current_user: CurrentUser) -> Note:
    return note_service.update_note(db, note_id=note_id, current_user=current_user, data=data)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(note_id: str, db: DbSession, current_user: CurrentUser) -> None:
    note_service.delete_note(db, note_id=note_id, current_user=current_user)
