from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AIFeature, NoteLength, NoteSource
from app.crud import note as note_crud
from app.models.note import Note
from app.models.user import User
from app.schemas.note import NoteChunkEdit, NoteChunkEditResponse, NoteCreate, NoteGenerate, NoteRefine, NoteUpdate
from app.services import token_usage_service
from app.services.llm import complete_for_user
from app.services.note_prompts import (
    NOTE_CHUNK_EDIT_SYSTEM_PROMPT,
    NOTE_GENERATION_SYSTEM_PROMPT,
    NOTE_REFINEMENT_SYSTEM_PROMPT,
    build_chunk_edit_user_prompt,
    build_note_generation_user_prompt,
    build_note_refinement_user_prompt,
)
from app.services.service_helpers import get_owned_or_404

_NOTE_MAX_TOKENS: dict[int, int] = {
    NoteLength.SHORT: 2048,
    NoteLength.MEDIUM: 4096,
    NoteLength.LONG: 8192,
}
_DEFAULT_MAX_TOKENS = 4096


def list_notes(
    db: Session,
    *,
    current_user: User,
    search: str | None = None,
    source: list[int] | None = None,
    sort_by: str | None = None,
    sort_order: str = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Note], int]:
    items, total = note_crud.list_by_user(
        db,
        user_id=current_user.id,
        search=search,
        source=source,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return list(items), total


def get_note(db: Session, *, note_id: str, current_user: User) -> Note:
    return get_owned_or_404(db, fetch=note_crud.get_by_id, id=note_id, current_user=current_user, entity_name="Note")


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
    updated = note_crud.update(db, note=note, data=data)
    db.commit()
    db.refresh(updated)
    return updated


def delete_note(db: Session, *, note_id: str, current_user: User) -> None:
    note = get_note(db, note_id=note_id, current_user=current_user)
    note_crud.delete(db, note=note)
    db.commit()


def generate_note(db: Session, *, current_user: User, data: NoteGenerate) -> Note:
    user_prompt = build_note_generation_user_prompt(
        data.topic,
        data.guidance,
        data.length,
    )

    max_tokens = _NOTE_MAX_TOKENS.get(int(data.length), _DEFAULT_MAX_TOKENS) if data.length else _DEFAULT_MAX_TOKENS

    result = complete_for_user(
        user=current_user,
        system=NOTE_GENERATION_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=max_tokens,
    )
    token_usage_service.record_usage(db, user_id=current_user.id, result=result, feature=AIFeature.NOTE_GENERATION)

    note = note_crud.create(
        db,
        user_id=current_user.id,
        title=data.topic,
        content=result.text,
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

    result = complete_for_user(
        user=current_user,
        system=NOTE_REFINEMENT_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=_DEFAULT_MAX_TOKENS,
    )
    token_usage_service.record_usage(db, user_id=current_user.id, result=result, feature=AIFeature.NOTE_REFINEMENT)

    updated = note_crud.update(
        db,
        note=note,
        data=NoteUpdate(content=result.text),
    )
    db.commit()
    db.refresh(updated)
    return updated


def edit_note_chunk(db: Session, *, note_id: str, current_user: User, data: NoteChunkEdit) -> NoteChunkEditResponse:
    get_note(db, note_id=note_id, current_user=current_user)

    user_prompt = build_chunk_edit_user_prompt(
        full_text=data.full_text,
        selected_text=data.selected_text,
        instructions=data.instructions,
    )

    result = complete_for_user(
        user=current_user,
        system=NOTE_CHUNK_EDIT_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=_DEFAULT_MAX_TOKENS,
    )
    token_usage_service.record_usage(db, user_id=current_user.id, result=result, feature=AIFeature.NOTE_CHUNK_EDIT)

    return NoteChunkEditResponse(edited_text=result.text)
