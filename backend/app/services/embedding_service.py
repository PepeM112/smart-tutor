"""Embedding service — chunking, OpenAI embeddings, and vector search.

Uses a system-level SYSTEM_OPENAI_API_KEY (infrastructure, not user-configurable).
The embedding model (text-embedding-3-small, 1536-dim) is fixed and independent
of the user's chat LLM provider choice.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import tiktoken
from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.core.enums import AIFeature, AIProvider
from app.crud import note as note_crud
from app.crud import note_chunk as note_chunk_crud
from app.crud import token_usage as token_usage_crud
from app.models.note_chunk import NoteChunk
from app.services.pricing_service import calculate_cost

logger = logging.getLogger("smarttutor.embedding")

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

_encoding = tiktoken.get_encoding("cl100k_base")


def _get_client() -> OpenAI:
    if not settings.system_openai_api_key:
        raise ValueError("SYSTEM_OPENAI_API_KEY is not set — embedding service unavailable")
    return OpenAI(api_key=settings.system_openai_api_key)


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TextChunk:
    text: str
    index: int


# The note editor stores text colors as inline HTML: <span data-color="red" data-bg="yellow">.
# Only the tags are removed; the text inside them stays. Tags carry no meaning for
# search and would only add noise tokens to the embeddings.
_COLOR_SPAN_TAG = re.compile(r"</?span(?:\s+data-(?:color|bg)=\"[a-z]+\")*\s*>")


def strip_color_spans(text_content: str) -> str:
    """Remove the note editor's color <span> tags and keep their inner text."""
    return _COLOR_SPAN_TAG.sub("", text_content)


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
    note = note_crud.get_by_id(db, id=note_id)
    if note is None:
        logger.warning("index_note: note %s not found, skipping", note_id)
        return

    # The embedding call is slow. If an autosave lands meanwhile, the chunks below are
    # already stale, so `mark_indexed` only succeeds while the note is still at this version.
    indexed_version = note.version

    note_chunk_crud.delete_by_note_id(db, note_id=note_id)

    header_parts = [f"Title: {note.title}"]
    if note.tags:
        header_parts.append(f"Tags: {', '.join(note.tags)}")
    header = "\n".join(header_parts) + "\n\n"

    chunks = chunk_text(header + strip_color_spans(note.content or ""))
    if not chunks:
        note_crud.mark_indexed(db, note_id=note_id, version=indexed_version)
        db.commit()
        return

    try:
        embeddings, total_tokens = _generate_embeddings([c.text for c in chunks])
    except ValueError:
        logger.warning("index_note: embedding service unavailable, skipping note %s", note_id)
        db.rollback()
        return
    except Exception:
        logger.exception("index_note: embedding generation failed for note %s", note_id)
        db.rollback()
        return

    note_chunk_crud.bulk_create(
        db,
        chunks=[
            NoteChunk(
                note_id=note_id,
                content=chunk.text,
                embedding=embedding,
                chunk_index=chunk.index,
            )
            for chunk, embedding in zip(chunks, embeddings, strict=True)
        ],
    )

    if not note_crud.mark_indexed(db, note_id=note_id, version=indexed_version):
        logger.info("index_note: note %s changed during indexing, left stale", note_id)

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
    """Search user's notes by semantic similarity. Returns top matching chunks.

    Stale notes (is_indexed=False) are indexed lazily before the search so the
    results reflect the latest saved content. A failure on any individual note is
    logged and skipped — it must not abort the search.
    """
    unindexed_ids = note_crud.list_unindexed_ids_by_user(db, user_id=user_id)
    for stale_id in unindexed_ids:
        try:
            index_note(db, note_id=stale_id)
        except Exception:
            # Drop the failed note's pending rows, or the next note's commit would save them.
            db.rollback()
            logger.exception("search_notes: failed to index stale note %s, skipping", stale_id)

    if note_chunk_crud.count_by_user(db, user_id=user_id) == 0:
        return []

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

    rows = note_chunk_crud.search_by_similarity(db, user_id=user_id, query_embedding=query_embedding, limit=limit)
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
