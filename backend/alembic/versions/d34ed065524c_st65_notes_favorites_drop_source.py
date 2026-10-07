"""st65 notes favorites drop source

Revision ID: d34ed065524c
Revises: 7c4e1a9d2b58
Create Date: 2026-10-04 20:57:37.104329

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d34ed065524c"
down_revision: Union[str, Sequence[str], None] = "7c4e1a9d2b58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("note", sa.Column("is_favorite", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("note", sa.Column("favorited_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_column("note", "source")


def downgrade() -> None:
    """Downgrade schema.

    The old values of `source` are lost on upgrade. Every note comes back as USER_CREATED (1).
    The temporary server default fills the existing rows, then it is dropped (the model had none).
    """
    op.add_column("note", sa.Column("source", sa.Integer(), server_default="1", nullable=False))
    op.alter_column("note", "source", server_default=None)
    op.drop_column("note", "favorited_at")
    op.drop_column("note", "is_favorite")
