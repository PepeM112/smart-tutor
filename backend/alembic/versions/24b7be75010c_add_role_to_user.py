"""add role to user

Revision ID: 24b7be75010c
Revises: 481a34c82351
Create Date: 2026-07-21 20:38:30.651126

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "24b7be75010c"
down_revision: str | Sequence[str] | None = "481a34c82351"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    userrole = postgresql.ENUM("UNKNOWN", "ADMIN", "USER", name="userrole")
    userrole.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "user",
        sa.Column(
            "role",
            sa.Enum("UNKNOWN", "ADMIN", "USER", name="userrole"),
            nullable=False,
            server_default="USER",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user", "role")
    postgresql.ENUM(name="userrole").drop(op.get_bind(), checkfirst=True)
