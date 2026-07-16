from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import NoteSource
from app.crud import note as note_crud
from app.models.note import Note
from app.models.user import User
from app.schemas.note import NoteCreate, NoteGenerate, NoteRefine, NoteUpdate
from app.services.llm import complete
from app.services.note_prompts import (
    NOTE_GENERATION_SYSTEM_PROMPT,
    NOTE_REFINEMENT_SYSTEM_PROMPT,
    build_note_generation_user_prompt,
    build_note_refinement_user_prompt,
)

NOTE_MAX_TOKENS = 4096


def list_notes(db: Session, *, current_user: User) -> list[Note]:
    return note_crud.list_by_user(db, user_id=current_user.id)


def get_note(db: Session, *, note_id: str, current_user: User) -> Note:
    note = note_crud.get_by_id(db, id=note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return note


def create_note(db: Session, *, current_user: User, data: NoteCreate) -> Note:
    note = note_crud.create(
        db,
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        content=data.content,
        source=NoteSource.USER_CREATED,
        tags=data.tags,
    )
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, *, note_id: str, current_user: User, data: NoteUpdate) -> Note:
    note = get_note(db, note_id=note_id, current_user=current_user)
    return note_crud.update(db, note=note, data=data)


def delete_note(db: Session, *, note_id: str, current_user: User) -> None:
    note = get_note(db, note_id=note_id, current_user=current_user)
    note_crud.delete(db, note=note)


def generate_note(db: Session, *, current_user: User, data: NoteGenerate) -> Note:
    user_prompt = build_note_generation_user_prompt(
        data.topic,
        data.guidance,
        data.length,
    )

    content = complete(
        system=NOTE_GENERATION_SYSTEM_PROMPT,
        user=user_prompt,
        max_tokens=NOTE_MAX_TOKENS,
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


def refine_note(db: Session, *, note_id: str, current_user: User, data: NoteRefine) -> Note:
    note = get_note(db, note_id=note_id, current_user=current_user)

    if not note.content or not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot refine an empty note",
        )

    user_prompt = build_note_refinement_user_prompt(
        current_content=note.content,
        instructions=data.instructions,
    )

    refined_content = complete(
        system=NOTE_REFINEMENT_SYSTEM_PROMPT,
        user=user_prompt,
        max_tokens=NOTE_MAX_TOKENS,
    )

    return note_crud.update(
        db,
        note=note,
        data=NoteUpdate(content=refined_content),
    )
