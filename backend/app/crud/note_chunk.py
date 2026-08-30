from collections.abc import Sequence
from typing import Any

from sqlalchemy import Row, delete, select
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.note_chunk import NoteChunk


def delete_by_note_id(db: Session, *, note_id: str) -> None:
    db.execute(delete(NoteChunk).where(NoteChunk.note_id == note_id))
    db.flush()


def bulk_create(db: Session, *, chunks: Sequence[NoteChunk]) -> None:
    db.add_all(chunks)
    db.flush()


def search_by_similarity(
    db: Session,
    *,
    user_id: str,
    query_embedding: list[float],
    limit: int = 5,
) -> list[Row[Any]]:
    similarity_col = (1 - NoteChunk.embedding.cosine_distance(query_embedding)).label("similarity")
    stmt = (
        select(
            NoteChunk.note_id,
            Note.title,
            NoteChunk.content,
            NoteChunk.chunk_index,
            similarity_col,
        )
        .join(Note, NoteChunk.note_id == Note.id)
        .where(Note.user_id == user_id)
        .order_by(similarity_col.desc())
        .limit(limit)
    )
    return list(db.execute(stmt).all())
