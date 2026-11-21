"""user anthropic model and ai effort

Revision ID: d6e9f3a2b7c4
Revises: c5d8e2f1a9b3
Create Date: 2026-11-20 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e9f3a2b7c4"
down_revision: str | Sequence[str] | None = "c5d8e2f1a9b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema. NULL model = the default model, so existing users need no backfill."""
    op.add_column("user", sa.Column("anthropic_model", sa.String(), nullable=True))
    op.add_column(
        "user",
        sa.Column("ai_effort", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user", "ai_effort")
    op.drop_column("user", "anthropic_model")
