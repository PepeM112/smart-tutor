from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import NoteSource
from app.crud import note as note_crud
from app.models.note import Note
from app.models.user import User
from app.schemas.note import NoteCreate, NoteGenerate, NoteUpdate
from app.services.ai import get_ai_provider


def _get_owned_note_or_404(db: Session, *, note_id: str, current_user: User) -> Note:
    note = note_crud.get_by_id(db, id=note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return note


def list_notes(db: Session, *, current_user: User) -> list[Note]:
    return note_crud.list_by_user(db, user_id=current_user.id)


def get_note(db: Session, *, note_id: str, current_user: User) -> Note:
    return _get_owned_note_or_404(db, note_id=note_id, current_user=current_user)


def create_note(db: Session, *, current_user: User, data: NoteCreate) -> Note:
    note = note_crud.create(
        db,
        user_id=current_user.id,
        title=data.title,
        content=data.content,
        source=NoteSource.USER_CREATED,
    )
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, *, note_id: str, current_user: User, data: NoteUpdate) -> Note:
    note = _get_owned_note_or_404(db, note_id=note_id, current_user=current_user)
    return note_crud.update(db, note=note, data=data)


def delete_note(db: Session, *, note_id: str, current_user: User) -> None:
    note = _get_owned_note_or_404(db, note_id=note_id, current_user=current_user)
    note_crud.delete(db, note=note)


def generate_note(db: Session, *, current_user: User, data: NoteGenerate) -> Note:
    provider = get_ai_provider()
    content = provider.generate_notes(
        topic=data.topic,
        guidance=data.guidance,
        length=data.length,
    )
    note = note_crud.create(
        db,
        user_id=current_user.id,
        title=data.topic,
        content=content,
        source=NoteSource.AI_GENERATED,
    )
    db.commit()
    db.refresh(note)
    return note
