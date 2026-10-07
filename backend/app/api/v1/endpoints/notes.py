from typing import Annotated, TypeAlias

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.models.note import Note
from app.schemas.note import (
    NOTE_SEARCH_MAX_CHARS,
    NOTE_SEARCH_MIN_CHARS,
    NoteChunkEdit,
    NoteChunkEditResponse,
    NoteContentMatch,
    NoteCreate,
    NoteFavorite,
    NoteGenerate,
    NoteMove,
    NoteRead,
    NoteUpdate,
)
from app.services import note_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


# Declared before the `/{note_id}` routes, so "search" is not read as a note id.
@router.get("/search", response_model=list[NoteContentMatch])
def search_content(
    db: DbSession,
    current_user: CurrentUser,
    q: Annotated[str, Query(min_length=NOTE_SEARCH_MIN_CHARS, max_length=NOTE_SEARCH_MAX_CHARS)],
    folder_id: str | None = None,
) -> list[NoteContentMatch]:
    """Find live notes by content, optionally only inside a folder and its sub-folders."""
    return note_service.search_notes_content(db, current_user=current_user, query=q, folder_id=folder_id)


@router.post("/generate", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def generate(data: NoteGenerate, db: DbSession, current_user: CurrentUser, bg: BackgroundTasks) -> Note:
    note = note_service.generate_note(db, current_user=current_user, data=data)
    bg.add_task(note_service.schedule_indexing, note.id)
    return note


@router.get("/{note_id}", response_model=NoteRead)
def get(note_id: str, db: DbSession, current_user: CurrentUser) -> Note:
    return note_service.get_note(db, note_id=note_id, current_user=current_user)


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create(data: NoteCreate, db: DbSession, current_user: CurrentUser, bg: BackgroundTasks) -> Note:
    note = note_service.create_note(db, current_user=current_user, data=data)
    bg.add_task(note_service.schedule_indexing, note.id)
    return note


@router.post("/{note_id}/edit-chunk", response_model=NoteChunkEditResponse)
def edit_chunk(note_id: str, data: NoteChunkEdit, db: DbSession, current_user: CurrentUser) -> NoteChunkEditResponse:
    return note_service.edit_note_chunk(db, note_id=note_id, current_user=current_user, data=data)


@router.patch("/{note_id}", response_model=NoteRead)
def update(note_id: str, data: NoteUpdate, db: DbSession, current_user: CurrentUser, bg: BackgroundTasks) -> Note:
    note = note_service.update_note(db, note_id=note_id, current_user=current_user, data=data)
    # Skip when already indexed: two tabs, or a leave right after a reindex, would re-embed for nothing
    if data.reindex and not note.is_indexed:
        bg.add_task(note_service.schedule_indexing, note.id)
    return note


@router.post("/{note_id}/move", response_model=NoteRead)
def move(note_id: str, data: NoteMove, db: DbSession, current_user: CurrentUser) -> Note:
    return note_service.move_note(db, note_id=note_id, current_user=current_user, folder_id=data.folder_id)


@router.put("/{note_id}/favorite", response_model=NoteRead)
def set_favorite(note_id: str, data: NoteFavorite, db: DbSession, current_user: CurrentUser) -> Note:
    return note_service.set_favorite(db, note_id=note_id, current_user=current_user, is_favorite=data.is_favorite)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(note_id: str, db: DbSession, current_user: CurrentUser) -> None:
    note_service.delete_note(db, note_id=note_id, current_user=current_user)
