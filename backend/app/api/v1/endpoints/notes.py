from typing import Annotated, TypeAlias

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.note import Note
from app.models.user import User
from app.schemas.note import (
    NoteChunkEdit,
    NoteChunkEditResponse,
    NoteCreate,
    NoteGenerate,
    NoteRead,
    NoteRefine,
    NoteSortBy,
    NoteUpdate,
    PaginatedNoteRead,
    SortOrder,
)
from app.services import note_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=PaginatedNoteRead)
def list_(
    db: DbSession,
    current_user: CurrentUser,
    title: str | None = None,
    content: str | None = None,
    source: Annotated[list[int] | None, Query()] = None,
    sort_by: Annotated[NoteSortBy | None, Query()] = None,
    sort_order: Annotated[SortOrder, Query()] = "desc",
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedNoteRead:
    items, total = note_service.list_notes(
        db,
        current_user=current_user,
        title=title,
        content=content,
        source=source,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return PaginatedNoteRead(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


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


@router.post("/{note_id}/refine", response_model=NoteRead)
def refine(note_id: str, data: NoteRefine, db: DbSession, current_user: CurrentUser, bg: BackgroundTasks) -> Note:
    note = note_service.refine_note(db, note_id=note_id, current_user=current_user, data=data)
    bg.add_task(note_service.schedule_indexing, note.id)
    return note


@router.post("/{note_id}/edit-chunk", response_model=NoteChunkEditResponse)
def edit_chunk(note_id: str, data: NoteChunkEdit, db: DbSession, current_user: CurrentUser) -> NoteChunkEditResponse:
    return note_service.edit_note_chunk(db, note_id=note_id, current_user=current_user, data=data)


@router.patch("/{note_id}", response_model=NoteRead)
def update(note_id: str, data: NoteUpdate, db: DbSession, current_user: CurrentUser, bg: BackgroundTasks) -> Note:
    note = note_service.update_note(db, note_id=note_id, current_user=current_user, data=data)
    if data.content is not None:
        bg.add_task(note_service.schedule_indexing, note.id)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(note_id: str, db: DbSession, current_user: CurrentUser) -> None:
    note_service.delete_note(db, note_id=note_id, current_user=current_user)
