import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AIFeature, NoteLength
from app.crud import folder as folder_crud
from app.crud import note as note_crud
from app.database import SessionLocal
from app.models.note import Note
from app.models.user import User
from app.schemas.note import (
    NOTE_SEARCH_MIN_CHARS,
    NoteChunkEdit,
    NoteChunkEditResponse,
    NoteContentMatch,
    NoteCreate,
    NoteGenerate,
    NoteUpdate,
)
from app.services import token_usage_service
from app.services.folder_service import get_live_folder_or_404
from app.services.llm import CompletionResult, complete_for_user
from app.services.note_prompts import (
    NOTE_CHUNK_EDIT_SYSTEM_PROMPT,
    NOTE_GENERATION_SYSTEM_PROMPT,
    NOTE_REFINEMENT_SYSTEM_PROMPT,
    build_chunk_edit_user_prompt,
    build_note_generation_user_prompt,
    build_note_refinement_user_prompt,
)
from app.services.note_text import markdown_to_plain_text
from app.services.service_helpers import get_owned_or_404, is_trash_expired

_NOTE_MAX_TOKENS: dict[int, int] = {
    NoteLength.SHORT: 2048,
    NoteLength.MEDIUM: 4096,
    NoteLength.LONG: 8192,
}
_DEFAULT_MAX_TOKENS = 4096

# Content search (`GET /notes/search`)
_SEARCH_LIMIT = 50
_SNIPPET_LENGTH = 80
_SNIPPET_LEAD = 30  # characters of context before the hit

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


def get_note(db: Session, *, note_id: str, current_user: User) -> Note:
    """Fetch any owned note, including trashed ones (for GET /notes/{id}).

    A note trashed longer ago than the retention time is gone: 404, even before the purge runs.
    """
    note = get_owned_or_404(db, fetch=note_crud.get_by_id, id=note_id, current_user=current_user, entity_name="Note")
    if is_trash_expired(note.deleted_at):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


def get_live_note(db: Session, *, note_id: str, current_user: User, for_update: bool = False) -> Note:
    """Fetch an owned note for a WRITE operation: raise 409 if it is in Trash.

    `for_update` locks the row until the transaction ends (SELECT ... FOR UPDATE). Only the
    content PATCH needs it (version check); tree writes use `folder_crud.lock_tree` instead.
    """
    note = get_owned_or_404(
        db,
        fetch=note_crud.get_by_id_for_update if for_update else note_crud.get_by_id,
        id=note_id,
        current_user=current_user,
        entity_name="Note",
    )
    if note.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Note is in Trash. Restore it before making changes.",
        )
    return note


def _validate_folder_ownership(db: Session, *, folder_id: str | None, current_user: User) -> None:
    """Raise 404/403 if folder_id is given but not a live folder owned by current_user.

    Before a write into the folder, the caller takes `folder_crud.lock_tree` first, so a
    concurrent trash of that folder can not leave a live item under it.
    """
    if folder_id is None:
        return
    get_live_folder_or_404(db, folder_id=folder_id, current_user=current_user)


def create_note(db: Session, *, current_user: User, data: NoteCreate) -> Note:
    folder_crud.lock_tree(db, user_id=current_user.id)
    _validate_folder_ownership(db, folder_id=data.folder_id, current_user=current_user)
    note = note_crud.create(
        db,
        user_id=current_user.id,
        title=data.title,
        content=data.content,
        tags=data.tags,
        folder_id=data.folder_id,
    )
    db.commit()
    db.refresh(note)
    return note


def move_note(db: Session, *, note_id: str, current_user: User, folder_id: str | None) -> Note:
    """Change note.folder_id only. Does not touch version or is_indexed."""
    folder_crud.lock_tree(db, user_id=current_user.id)
    note = get_live_note(db, note_id=note_id, current_user=current_user)
    _validate_folder_ownership(db, folder_id=folder_id, current_user=current_user)
    note_crud.move(db, note=note, folder_id=folder_id)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, *, note_id: str, current_user: User, data: NoteUpdate) -> Note:
    # Row lock: two concurrent PATCHes with the same version would otherwise both pass
    # the check below. With the lock, the second one waits, sees the new version and gets 409.
    note = get_live_note(db, note_id=note_id, current_user=current_user, for_update=True)

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


def set_favorite(db: Session, *, note_id: str, current_user: User, is_favorite: bool) -> Note:
    """Star or unstar a note. Does not change `version` or `updated_at` (see `note_crud.set_favorite`).

    A note in Trash gives 409, like every other write.
    """
    note = get_live_note(db, note_id=note_id, current_user=current_user)
    # A repeated PUT must not change anything: a new `favorited_at` would move the note in the sidebar.
    if note.is_favorite == is_favorite:
        return note
    note_crud.set_favorite(db, note=note, is_favorite=is_favorite, now=datetime.now(timezone.utc))
    db.commit()
    db.refresh(note)
    return note


def _build_snippet(content: str, query: str) -> str | None:
    """About `_SNIPPET_LENGTH` characters of `content` around the first hit of `query`.

    The markdown is turned into plain text first, so the snippet shows what the reader sees
    (no `#`, `**`, fences or editor HTML). A cut edge gets an ellipsis.
    Returns None when the plain text has no hit: the query matched only hidden markup
    (`red` in a color span, `table` in a table tag), so the note is not a real result.
    """
    content = markdown_to_plain_text(content)
    # The plain text has collapsed whitespace, so the query gets the same (not the full markdown cleanup).
    needle = " ".join(query.split())
    hit = re.search(re.escape(needle), content, flags=re.IGNORECASE)
    if hit is None:
        return None
    start = max(0, hit.start() - _SNIPPET_LEAD)
    # A long hit must not be cut.
    end = min(len(content), max(start + _SNIPPET_LENGTH, hit.end()))
    text = content[start:end].strip()
    return f"{'…' if start > 0 else ''}{text}{'…' if end < len(content) else ''}"


def search_notes_content(
    db: Session, *, current_user: User, query: str, folder_id: str | None = None
) -> list[NoteContentMatch]:
    """Find live notes whose content contains `query`. With `folder_id`: only that folder and its sub-folders.

    Notes whose title also matches stay in the results and sort last, so they do not use up the limit.
    Notes where the hit is only in markup are left out (see `_build_snippet`).
    """
    query = query.strip()
    if len(query) < NOTE_SEARCH_MIN_CHARS:
        return []
    folder_ids: list[str] | None = None
    if folder_id is not None:
        get_live_folder_or_404(db, folder_id=folder_id, current_user=current_user)
        folder_ids = [folder_id, *folder_crud.get_descendant_ids(db, folder_id=folder_id)]
    rows = note_crud.search_live_content(
        db, user_id=current_user.id, query=query, folder_ids=folder_ids, limit=_SEARCH_LIMIT
    )
    snippets = ((row, _build_snippet(row.content, query)) for row in rows)
    return [
        NoteContentMatch(id=row.id, title=row.title, folder_id=row.folder_id, snippet=snippet)
        for row, snippet in snippets
        if snippet is not None
    ]


def delete_note(db: Session, *, note_id: str, current_user: User) -> None:
    """Soft-delete a note (move to Trash). Already-trashed notes are a no-op."""
    folder_crud.lock_tree(db, user_id=current_user.id)
    note = get_note(db, note_id=note_id, current_user=current_user)
    if note.deleted_at is None:
        note_crud.soft_delete(db, note=note, now=datetime.now(timezone.utc))
        db.commit()


def generate_note(db: Session, *, current_user: User, data: NoteGenerate) -> Note:
    # Validate folder ownership before spending AI tokens. No lock yet: the AI call is slow,
    # and the tree lock would block all tree writes of the user for that time.
    _validate_folder_ownership(db, folder_id=data.folder_id, current_user=current_user)

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
    # Check again under the tree lock: the folder can be trashed while the AI works.
    # `lock_tree` expires the folder read above, so this check reads the committed state.
    folder_crud.lock_tree(db, user_id=current_user.id)
    _validate_folder_ownership(db, folder_id=data.folder_id, current_user=current_user)
    note = note_crud.create(
        db,
        user_id=current_user.id,
        title=data.topic,
        content=result.text,
        folder_id=data.folder_id,
    )
    db.commit()
    db.refresh(note)
    return note


def preview_refine_note(db: Session, *, note_id: str, current_user: User, instructions: str) -> tuple[str, str]:
    """Run the AI refinement and return `(old_content, refined_content)`. Does NOT save the note.

    Only the usage row is committed. The user accepts the diff in the editor, and autosave saves it.
    """
    note = get_live_note(db, note_id=note_id, current_user=current_user)
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
    get_live_note(db, note_id=note_id, current_user=current_user)

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
