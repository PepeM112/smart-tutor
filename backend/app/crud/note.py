from collections.abc import Sequence
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, UnaryExpression, func, select
from sqlalchemy import delete as sql_delete
from sqlalchemy import update as sql_update  # `update` is taken by the CRUD function below
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.core.enums import NoteSource
from app.crud.helpers import ilike_search
from app.models.note import Note
from app.schemas.note import NoteSortBy, NoteUpdate, SortOrder


def get_by_id(db: Session, *, id: str) -> Note | None:
    stmt = select(Note).where(Note.id == id)
    return db.scalars(stmt).first()


def get_by_id_for_update(db: Session, *, id: str) -> Note | None:
    """Like `get_by_id`, but locks the row until the transaction ends (SELECT … FOR UPDATE)."""
    stmt = select(Note).where(Note.id == id).with_for_update()
    return db.scalars(stmt).first()


def list_live_by_ids(db: Session, *, ids: Sequence[str]) -> Sequence[Note]:
    """Return the LIVE (non-trashed) notes among `ids`."""
    stmt = select(Note).where(Note.id.in_(ids), Note.deleted_at.is_(None))
    return db.scalars(stmt).all()


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
    # Only live (non-trashed) notes appear in list views.
    stmt = select(Note).where(Note.user_id == user_id, Note.deleted_at.is_(None))

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
    content: str = "",
    source: NoteSource,
    tags: list[str] | None = None,
    folder_id: str | None = None,
) -> Note:
    note = Note(
        user_id=user_id,
        folder_id=folder_id,
        title=title,
        content=content,
        source=int(source),
        tags=tags or [],
    )
    db.add(note)
    db.flush()
    return note


def update(db: Session, *, note: Note, data: NoteUpdate) -> Note:
    # Exclude metadata fields that the service manages directly (not DB columns to overwrite blindly).
    for field, value in data.model_dump(exclude_unset=True, exclude={"version", "reindex"}).items():
        setattr(note, field, value)
    db.flush()
    return note


def list_unindexed_ids_by_user(db: Session, *, user_id: str) -> list[str]:
    """Return IDs of LIVE notes owned by user that have not yet been embedded."""
    stmt = select(Note.id).where(Note.user_id == user_id, Note.is_indexed.is_(False), Note.deleted_at.is_(None))
    return list(db.scalars(stmt).all())


def mark_indexed(db: Session, *, note_id: str, version: int) -> bool:
    """Set `is_indexed = True` only if the note is still at `version`. Returns False if it changed."""
    stmt = sql_update(Note).where(Note.id == note_id, Note.version == version).values(is_indexed=True)
    # A bulk UPDATE returns a CursorResult; `Session.execute` is typed as the generic Result.
    result = cast(CursorResult[Any], db.execute(stmt))
    return result.rowcount > 0


def move(db: Session, *, note: Note, folder_id: str | None) -> Note:
    """Change `folder_id` only. Does not touch version or is_indexed."""
    note.folder_id = folder_id
    db.flush()
    return note


def soft_delete(db: Session, *, note: Note, now: datetime) -> Note:
    """Move a note to Trash."""
    note.deleted_at = now
    db.flush()
    return note


def restore(db: Session, *, note: Note, folder_id: str | None) -> Note:
    """Bring a trashed note back into `folder_id` and clear its `orphan_path`."""
    note.folder_id = folder_id
    note.orphan_path = None
    note.deleted_at = None
    db.flush()
    return note


def delete(db: Session, *, note: Note) -> None:
    """Permanently delete one note."""
    db.delete(note)
    db.flush()


def delete_all_trashed(db: Session, *, user_id: str) -> None:
    """Bulk-delete every trashed note of the user with one DELETE."""
    db.execute(sql_delete(Note).where(Note.user_id == user_id, Note.deleted_at.is_not(None)))
    db.flush()
