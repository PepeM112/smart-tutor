"""migrate test status to integer column

Revision ID: c7f8a9b0d1e2
Revises: db41e11ba5e2
Create Date: 2026-08-16 21:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7f8a9b0d1e2"
down_revision: str | Sequence[str] | None = "4ba1ab6f9d37"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_VALUES: dict[str, int] = {"UNKNOWN": 0, "ACTIVE": 1, "DELETED": 2}


def upgrade() -> None:
    op.add_column("test", sa.Column("status_new", sa.Integer(), nullable=True))

    status_case = " ".join(f"WHEN '{label}' THEN {value}" for label, value in _STATUS_VALUES.items())
    op.execute(f"UPDATE test SET status_new = CASE status::text {status_case} END")

    op.alter_column("test", "status_new", nullable=False, server_default=str(_STATUS_VALUES["ACTIVE"]))

    op.drop_column("test", "status")
    op.alter_column("test", "status_new", new_column_name="status")

    op.execute("DROP TYPE IF EXISTS teststatus")


def downgrade() -> None:
    teststatus = postgresql.ENUM(*_STATUS_VALUES.keys(), name="teststatus")
    teststatus.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "test",
        sa.Column("status_old", sa.Enum(*_STATUS_VALUES.keys(), name="teststatus"), nullable=True),
    )

    status_case = " ".join(f"WHEN {value} THEN '{label}'" for label, value in _STATUS_VALUES.items())
    op.execute(f"UPDATE test SET status_old = (CASE status {status_case} END)::teststatus")

    op.alter_column("test", "status_old", nullable=False, server_default="ACTIVE")

    op.drop_column("test", "status")
    op.alter_column("test", "status_old", new_column_name="status")
