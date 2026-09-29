"""add orphan_path to folder and note

Revision ID: c7a4e9d2b813
Revises: b21642e96cb5
Create Date: 2026-09-29 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c7a4e9d2b813"
down_revision: str | Sequence[str] | None = "b21642e96cb5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Names of folders deleted forever above the item (outermost first). Restore rebuilds them.
    op.add_column("folder", sa.Column("orphan_path", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("note", sa.Column("orphan_path", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("note", "orphan_path")
    op.drop_column("folder", "orphan_path")
