"""add status to test

Revision ID: a7f0d8c06bfd
Revises: d1a850abcb2a
Create Date: 2026-07-05 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7f0d8c06bfd"
down_revision: str | Sequence[str] | None = "d1a850abcb2a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    teststatus = postgresql.ENUM("UNKNOWN", "ACTIVE", "DELETED", name="teststatus")
    teststatus.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "test",
        sa.Column(
            "status",
            sa.Enum("UNKNOWN", "ACTIVE", "DELETED", name="teststatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("test", "status")
    postgresql.ENUM(name="teststatus").drop(op.get_bind(), checkfirst=True)
