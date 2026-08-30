from collections.abc import Sequence
from typing import cast

from sqlalchemy import UnaryExpression, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.core.enums import NoteSource
from app.crud.helpers import ilike_search
from app.models.note import Note
from app.schemas.note import NoteSortBy, NoteUpdate, SortOrder


def get_by_id(db: Session, *, id: str) -> Note | None:
    stmt = select(Note).where(Note.id == id)
    return db.scalars(stmt).first()


_SORT_COLUMNS: dict[str, InstrumentedAttribute[object]] = {
    "title": Note.title,
    "updated_at": Note.updated_at,
    "created_at": Note.id,  # ULID is time-sortable
}


def _sort_clause(sort_by: NoteSortBy | None, sort_order: SortOrder) -> UnaryExpression[object]:
    column = _SORT_COLUMNS[sort_by] if sort_by and sort_by in _SORT_COLUMNS else Note.updated_at
    clause = column.asc() if sort_order == "asc" else column.desc()
    return cast(UnaryExpression[object], clause)


def list_by_user(
    db: Session,
    *,
    user_id: str,
    title: str | None = None,
    content: str | None = None,
    source: list[int] | None = None,
    sort_by: NoteSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[Sequence[Note], int]:
    stmt = select(Note).where(Note.user_id == user_id)

    if title:
        stmt = stmt.where(ilike_search(Note.title, value=title))
    if content:
        stmt = stmt.where(ilike_search(Note.content, value=content))
    if source:
        stmt = stmt.where(Note.source.in_(source))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(_sort_clause(sort_by, sort_order)).offset((page - 1) * per_page).limit(per_page)
    notes = db.scalars(stmt).all()
    return notes, total


def create(
    db: Session,
    *,
    user_id: str,
    title: str,
    description: str | None = None,
    content: str = "",
    source: NoteSource,
    tags: list[str] | None = None,
) -> Note:
    note = Note(
        user_id=user_id,
        title=title,
        description=description,
        content=content,
        source=int(source),
        tags=tags or [],
    )
    db.add(note)
    db.flush()
    return note


def update(db: Session, *, note: Note, data: NoteUpdate) -> Note:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.flush()
    return note


def delete(db: Session, *, note: Note) -> None:
    db.delete(note)
    db.flush()
