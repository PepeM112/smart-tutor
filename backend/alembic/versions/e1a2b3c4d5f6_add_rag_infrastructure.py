"""add RAG infrastructure: pgvector, pg_trgm, note_chunks, is_indexed

Revision ID: e1a2b3c4d5f6
Revises: 4f15c5394e25, 4ba1ab6f9d37
Create Date: 2026-08-30 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision: str = "e1a2b3c4d5f6"
down_revision: str | tuple[str, ...] = ("4f15c5394e25", "4ba1ab6f9d37")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.execute("TRUNCATE TABLE note CASCADE")

    op.add_column("note", sa.Column("is_indexed", sa.Boolean(), server_default="false", nullable=False))

    op.execute("CREATE INDEX idx_notes_title_trgm ON note USING gin (title gin_trgm_ops)")
    op.execute("CREATE INDEX idx_notes_content_trgm ON note USING gin (content gin_trgm_ops)")

    op.create_table(
        "note_chunk",
        sa.Column("id", sa.String(26), primary_key=True),
        sa.Column("note_id", sa.String(26), sa.ForeignKey("note.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
    )

    op.execute("CREATE INDEX idx_note_chunk_embedding_hnsw ON note_chunk USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_note_chunk_embedding_hnsw")
    op.drop_table("note_chunk")

    op.execute("DROP INDEX IF EXISTS idx_notes_content_trgm")
    op.execute("DROP INDEX IF EXISTS idx_notes_title_trgm")

    op.drop_column("note", "is_indexed")
