"""migrate user status and role to integer columns

Revision ID: db41e11ba5e2
Revises: a1b2c3d4e5f6
Create Date: 2026-08-16 18:10:42.085430

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "db41e11ba5e2"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Enum label -> IntEnum value. Must match app.core.enums.UserStatus / UserRole exactly.
_STATUS_VALUES: dict[str, int] = {"UNKNOWN": 0, "ACTIVE": 1, "DELETED": 2, "BLOCKED": 3}
_ROLE_VALUES: dict[str, int] = {"UNKNOWN": 0, "ADMIN": 1, "USER": 2}


def upgrade() -> None:
    """Upgrade schema.

    Native Postgres ENUM columns can't be cast to Integer in place, so this
    adds new integer columns, backfills them from the enum labels, drops the
    old enum columns, renames the new ones into place, then drops the now
    unused ENUM types. Every step here is transactional DDL in Postgres.
    """
    # 1. Add new integer columns (nullable for now — backfilled below).
    op.add_column("user", sa.Column("status_new", sa.Integer(), nullable=True))
    op.add_column("user", sa.Column("role_new", sa.Integer(), nullable=True))

    # 2. Backfill from the existing enum labels (label name == IntEnum member name).
    status_case = " ".join(f"WHEN '{label}' THEN {value}" for label, value in _STATUS_VALUES.items())
    op.execute(f'UPDATE "user" SET status_new = CASE status::text {status_case} END')

    role_case = " ".join(f"WHEN '{label}' THEN {value}" for label, value in _ROLE_VALUES.items())
    op.execute(f'UPDATE "user" SET role_new = CASE role::text {role_case} END')

    # 3. Now that every row is backfilled, enforce NOT NULL + server defaults.
    op.alter_column("user", "status_new", nullable=False, server_default=str(_STATUS_VALUES["ACTIVE"]))
    op.alter_column("user", "role_new", nullable=False, server_default=str(_ROLE_VALUES["USER"]))

    # 4. Drop the old enum columns and rename the new ones into place.
    op.drop_column("user", "status")
    op.drop_column("user", "role")
    op.alter_column("user", "status_new", new_column_name="status")
    op.alter_column("user", "role_new", new_column_name="role")

    # 5. Drop the now-unused native ENUM types.
    op.execute("DROP TYPE IF EXISTS userstatus")
    op.execute("DROP TYPE IF EXISTS userrole")


def downgrade() -> None:
    """Downgrade schema — recreate the native ENUM types and reverse the backfill."""
    userstatus = postgresql.ENUM(*_STATUS_VALUES.keys(), name="userstatus")
    userstatus.create(op.get_bind(), checkfirst=True)
    userrole = postgresql.ENUM(*_ROLE_VALUES.keys(), name="userrole")
    userrole.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "user",
        sa.Column("status_old", sa.Enum(*_STATUS_VALUES.keys(), name="userstatus"), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column("role_old", sa.Enum(*_ROLE_VALUES.keys(), name="userrole"), nullable=True),
    )

    status_case = " ".join(f"WHEN {value} THEN '{label}'" for label, value in _STATUS_VALUES.items())
    op.execute(f'UPDATE "user" SET status_old = (CASE status {status_case} END)::userstatus')

    role_case = " ".join(f"WHEN {value} THEN '{label}'" for label, value in _ROLE_VALUES.items())
    op.execute(f'UPDATE "user" SET role_old = (CASE role {role_case} END)::userrole')

    op.alter_column("user", "status_old", nullable=False, server_default="ACTIVE")
    op.alter_column("user", "role_old", nullable=False, server_default="USER")

    op.drop_column("user", "status")
    op.drop_column("user", "role")
    op.alter_column("user", "status_old", new_column_name="status")
    op.alter_column("user", "role_old", new_column_name="role")
