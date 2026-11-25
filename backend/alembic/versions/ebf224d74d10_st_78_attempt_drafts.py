"""ST-78 attempt drafts

Revision ID: ebf224d74d10
Revises: 4f4d733b7d96
Create Date: 2026-11-24 23:17:50.269396

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ebf224d74d10"
down_revision: str | Sequence[str] | None = "4f4d733b7d96"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("space_attempt", sa.Column("draft_answers", sa.JSON(), nullable=True))
    op.add_column("space_attempt", sa.Column("draft_saved_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("space_attempt", "draft_saved_at")
    op.drop_column("space_attempt", "draft_answers")
