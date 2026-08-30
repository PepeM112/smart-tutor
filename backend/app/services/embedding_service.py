"""Embedding service — chunking, OpenAI embeddings, and vector search.

Uses a system-level SYSTEM_OPENAI_API_KEY (infrastructure, not user-configurable).
The embedding model (text-embedding-3-small, 1536-dim) is fixed and independent
of the user's chat LLM provider choice.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import tiktoken
from openai import OpenAI
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.enums import AIFeature, AIProvider
from app.crud import token_usage as token_usage_crud
from app.models.note import Note
from app.models.note_chunk import NoteChunk
from app.services.pricing_service import calculate_cost

logger = logging.getLogger("smarttutor.embedding")

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

_encoding = tiktoken.get_encoding("cl100k_base")


def _get_client() -> OpenAI:
    return OpenAI(api_key=settings.system_openai_api_key)


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TextChunk:
    text: str
    index: int


def chunk_text(text_content: str) -> list[TextChunk]:
    """Split text into ~500-token chunks with 50-token overlap."""
    if not text_content or not text_content.strip():
        return []

    tokens = _encoding.encode(text_content)
    if len(tokens) <= CHUNK_SIZE:
        return [TextChunk(text=text_content.strip(), index=0)]

    chunks: list[TextChunk] = []
    start = 0
    idx = 0

    while start < len(tokens):
        end = min(start + CHUNK_SIZE, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_str = _encoding.decode(chunk_tokens).strip()
        if chunk_str:
            chunks.append(TextChunk(text=chunk_str, index=idx))
            idx += 1
        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------


def _generate_embeddings(texts: list[str]) -> tuple[list[list[float]], int]:
    """Generate embeddings for a batch of texts. Returns (embeddings, total_tokens)."""
    client = _get_client()
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    total_tokens = response.usage.total_tokens
    embeddings = [item.embedding for item in sorted(response.data, key=lambda d: d.index)]
    return embeddings, total_tokens


# ---------------------------------------------------------------------------
# Note indexing
# ---------------------------------------------------------------------------


def index_note(db: Session, *, note_id: str) -> None:
    """Chunk a note's content, generate embeddings, and store in note_chunks.

    Called as a BackgroundTask after note creation or update.
    """
    note = db.get(Note, note_id)
    if note is None:
        logger.warning("index_note: note %s not found, skipping", note_id)
        return

    db.execute(delete(NoteChunk).where(NoteChunk.note_id == note_id))
    db.flush()

    chunks = chunk_text(note.content or "")
    if not chunks:
        note.is_indexed = True
        db.commit()
        return

    try:
        embeddings, total_tokens = _generate_embeddings([c.text for c in chunks])
    except Exception:
        logger.exception("index_note: embedding generation failed for note %s", note_id)
        db.rollback()
        return

    for chunk, embedding in zip(chunks, embeddings, strict=True):
        db.add(
            NoteChunk(
                note_id=note_id,
                content=chunk.text,
                embedding=embedding,
                chunk_index=chunk.index,
            )
        )

    note.is_indexed = True
    db.flush()

    cost = calculate_cost(db, model=EMBEDDING_MODEL, input_tokens=total_tokens, output_tokens=0)
    token_usage_crud.create(
        db,
        user_id=note.user_id,
        provider=AIProvider.OPENAI,
        model=EMBEDDING_MODEL,
        feature=AIFeature.EMBEDDING,
        input_tokens=total_tokens,
        output_tokens=0,
        estimated_cost=cost,
    )

    db.commit()
    logger.info("index_note: indexed note %s (%d chunks, %d tokens)", note_id, len(chunks), total_tokens)


# ---------------------------------------------------------------------------
# Vector search
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SearchResult:
    note_id: str
    note_title: str
    chunk_content: str
    chunk_index: int
    similarity: float


def search_notes(db: Session, *, user_id: str, query: str, limit: int = 5) -> list[SearchResult]:
    """Search user's notes by semantic similarity. Returns top matching chunks."""
    embeddings, total_tokens = _generate_embeddings([query])
    query_embedding = embeddings[0]

    cost = calculate_cost(db, model=EMBEDDING_MODEL, input_tokens=total_tokens, output_tokens=0)
    token_usage_crud.create(
        db,
        user_id=user_id,
        provider=AIProvider.OPENAI,
        model=EMBEDDING_MODEL,
        feature=AIFeature.EMBEDDING,
        input_tokens=total_tokens,
        output_tokens=0,
        estimated_cost=cost,
    )
    db.flush()

    stmt = (
        select(
            NoteChunk.note_id,
            Note.title,
            NoteChunk.content,
            NoteChunk.chunk_index,
            (1 - NoteChunk.embedding.cosine_distance(query_embedding)).label("similarity"),
        )
        .join(Note, NoteChunk.note_id == Note.id)
        .where(Note.user_id == user_id)
        .order_by(text("similarity DESC"))
        .limit(limit)
    )

    rows = db.execute(stmt).all()
    return [
        SearchResult(
            note_id=row.note_id,
            note_title=row.title,
            chunk_content=row.content,
            chunk_index=row.chunk_index,
            similarity=float(row.similarity),
        )
        for row in rows
    ]
