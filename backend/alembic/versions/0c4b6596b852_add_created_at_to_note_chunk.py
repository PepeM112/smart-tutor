"""add created_at to note_chunk

Revision ID: 0c4b6596b852
Revises: e1a2b3c4d5f6
Create Date: 2026-08-30 18:58:43.488893

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0c4b6596b852"
down_revision: str | Sequence[str] | None = "e1a2b3c4d5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "note_chunk",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("note_chunk", "created_at")
