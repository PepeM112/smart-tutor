from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import NoteSource
from app.models.note import Note
from app.schemas.note import NoteUpdate


def get_by_id(db: Session, *, id: str) -> Note | None:
    stmt = select(Note).where(Note.id == id)
    return db.scalars(stmt).first()


def list_by_user(db: Session, *, user_id: str) -> list[Note]:
    stmt = select(Note).where(Note.user_id == user_id).order_by(Note.updated_at.desc())
    return list(db.scalars(stmt).all())


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
