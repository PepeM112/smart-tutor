"""widen theme column to string 20

Revision ID: 481a34c82351
Revises: d6e97aac94f4
Create Date: 2026-07-19 13:32:03.819575

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "481a34c82351"
down_revision: str | Sequence[str] | None = "d6e97aac94f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "user",
        "theme",
        existing_type=sa.VARCHAR(length=10),
        type_=sa.String(length=20),
        existing_nullable=False,
        existing_server_default=sa.text("'system'::character varying"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "user",
        "theme",
        existing_type=sa.String(length=20),
        type_=sa.VARCHAR(length=10),
        existing_nullable=False,
        existing_server_default=sa.text("'system'::character varying"),
    )
