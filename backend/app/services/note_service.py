from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AIFeature, NoteLength, NoteSource
from app.crud import note as note_crud
from app.database import SessionLocal
from app.models.note import Note
from app.models.user import User
from app.schemas.note import (
    NoteChunkEdit,
    NoteChunkEditResponse,
    NoteCreate,
    NoteGenerate,
    NoteRead,
    NoteSortBy,
    NoteUpdate,
    SortOrder,
)
from app.services import token_usage_service
from app.services.llm import CompletionResult, complete_for_user
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

# Refine and chunk edit return a rewrite of their input, so the output is about as long as
# the input. A fixed limit cut long notes off, and the diff then showed the end as deleted.
_EDIT_MAX_TOKENS_CAP = 16_384  # gpt-4o-mini's output limit (Haiku 4.5 allows more)
_EDIT_OUTPUT_HEADROOM = 1.3  # the rewrite can be longer than the input
_EDIT_EXTRA_TOKENS = 1024
_CHARS_PER_TOKEN = 3  # a low estimate (more tokens), so the limit errs on the large side


def _edit_max_tokens(text: str) -> int:
    """Output token limit for an AI rewrite of `text`."""
    estimated = len(text) // _CHARS_PER_TOKEN
    wanted = int(estimated * _EDIT_OUTPUT_HEADROOM) + _EDIT_EXTRA_TOKENS
    return min(max(wanted, _DEFAULT_MAX_TOKENS), _EDIT_MAX_TOKENS_CAP)


def _reject_truncated(db: Session, result: CompletionResult) -> None:
    """Raise 422 when the AI output is cut off: a partial rewrite would delete the rest of the text.

    The usage is committed first: the tokens were spent even though the result is not used.
    """
    if not result.truncated:
        return
    db.commit()
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="The text is too long for the AI to rewrite in one go. Select a smaller part and try again.",
    )


def schedule_indexing(note_id: str) -> None:
    """Run note embedding indexing in a fresh DB session (for BackgroundTasks)."""
    from app.services import embedding_service

    db = SessionLocal()
    try:
        embedding_service.index_note(db, note_id=note_id)
    finally:
        db.close()


def list_notes(
    db: Session,
    *,
    current_user: User,
    title: str | None = None,
    content: str | None = None,
    source: list[int] | None = None,
    sort_by: NoteSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[NoteRead], int]:
    items, total = note_crud.list_by_user(
        db,
        user_id=current_user.id,
        title=title,
        content=content,
        source=source,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return [NoteRead.model_validate(n) for n in items], total


def get_note(db: Session, *, note_id: str, current_user: User) -> Note:
    return get_owned_or_404(db, fetch=note_crud.get_by_id, id=note_id, current_user=current_user, entity_name="Note")


def create_note(db: Session, *, current_user: User, data: NoteCreate) -> Note:
    note = note_crud.create(
        db,
        user_id=current_user.id,
        title=data.title,
        content=data.content,
        source=NoteSource.USER_CREATED,
        tags=data.tags,
    )
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, *, note_id: str, current_user: User, data: NoteUpdate) -> Note:
    # Row lock: two concurrent PATCHes with the same version would otherwise both pass
    # the check below. With the lock, the second one waits, sees the new version and gets 409.
    note = get_owned_or_404(
        db, fetch=note_crud.get_by_id_for_update, id=note_id, current_user=current_user, entity_name="Note"
    )

    content_fields_changing = data.content is not None or data.title is not None or data.tags is not None

    if content_fields_changing:
        if data.version != note.version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Note was modified elsewhere",
            )
        note.is_indexed = False

    updated = note_crud.update(db, note=note, data=data)

    if content_fields_changing:
        updated.version += 1
        db.flush()

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


def preview_refine_note(db: Session, *, note_id: str, current_user: User, instructions: str) -> tuple[str, str]:
    """Run the AI refinement and return `(old_content, refined_content)`. Does NOT save the note.

    Only the usage row is committed. The user accepts the diff in the editor, and autosave saves it.
    """
    note = get_note(db, note_id=note_id, current_user=current_user)
    if not note.content or not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot refine an empty note",
        )

    user_prompt = build_note_refinement_user_prompt(
        current_content=note.content,
        instructions=instructions,
    )

    result = complete_for_user(
        user=current_user,
        system=NOTE_REFINEMENT_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=_edit_max_tokens(note.content),
    )
    token_usage_service.record_usage(db, user_id=current_user.id, result=result, feature=AIFeature.NOTE_REFINEMENT)
    _reject_truncated(db, result)
    db.commit()
    return note.content, result.text


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
        max_tokens=_edit_max_tokens(data.selected_text),
    )
    token_usage_service.record_usage(db, user_id=current_user.id, result=result, feature=AIFeature.NOTE_CHUNK_EDIT)
    _reject_truncated(db, result)
    # Nothing else commits this request's session, so the usage row would be lost.
    db.commit()

    return NoteChunkEditResponse(edited_text=result.text)
