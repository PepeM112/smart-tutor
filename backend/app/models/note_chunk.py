from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import generate_ulid


class NoteChunk(Base):
    __tablename__ = "note_chunk"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    note_id: Mapped[str] = mapped_column(String(26), ForeignKey("note.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(1536))
    chunk_index: Mapped[int] = mapped_column(Integer)
