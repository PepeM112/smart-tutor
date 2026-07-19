"""add user settings columns

Revision ID: d6e97aac94f4
Revises: 0ab16b13962c
Create Date: 2026-07-19 11:29:54.491857

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e97aac94f4"
down_revision: str | Sequence[str] | None = "0ab16b13962c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    aiprovider = postgresql.ENUM("UNKNOWN", "ANTHROPIC", "OPENAI", name="aiprovider")
    aiprovider.create(op.get_bind(), checkfirst=True)

    op.add_column("user", sa.Column("display_name", sa.String(), nullable=True))
    op.add_column("user", sa.Column("locale", sa.String(length=5), nullable=False, server_default="en"))
    op.add_column("user", sa.Column("theme", sa.String(length=10), nullable=False, server_default="system"))
    op.add_column(
        "user",
        sa.Column(
            "ai_provider",
            sa.Enum("UNKNOWN", "ANTHROPIC", "OPENAI", name="aiprovider"),
            nullable=True,
        ),
    )
    op.add_column("user", sa.Column("encrypted_anthropic_key", sa.String(), nullable=True))
    op.add_column("user", sa.Column("encrypted_openai_key", sa.String(), nullable=True))
    op.add_column("user", sa.Column("daily_review_limit", sa.Integer(), nullable=True))
    op.add_column("user", sa.Column("initial_ease_factor", sa.Float(), nullable=False, server_default="2.5"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user", "initial_ease_factor")
    op.drop_column("user", "daily_review_limit")
    op.drop_column("user", "encrypted_openai_key")
    op.drop_column("user", "encrypted_anthropic_key")
    op.drop_column("user", "ai_provider")
    op.drop_column("user", "theme")
    op.drop_column("user", "locale")
    op.drop_column("user", "display_name")

    postgresql.ENUM(name="aiprovider").drop(op.get_bind(), checkfirst=True)
