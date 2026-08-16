"""migrate user ai_provider from native enum to integer column

Revision ID: 4ba1ab6f9d37
Revises: 60923bc47338
Create Date: 2026-08-16 20:24:17.000278

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4ba1ab6f9d37"
down_revision: str | Sequence[str] | None = "60923bc47338"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Enum label -> IntEnum value. Must match app.core.enums.AIProvider.
# UNKNOWN was removed in 60923bc47338 but the native ENUM type still has it.
_PROVIDER_VALUES: dict[str, int | None] = {
    "UNKNOWN": None,
    "ANTHROPIC": 1,
    "OPENAI": 2,
}


def upgrade() -> None:
    # 1. Add a new nullable integer column.
    op.add_column("user", sa.Column("ai_provider_new", sa.Integer(), nullable=True))

    # 2. Backfill from the existing enum labels. UNKNOWN -> NULL.
    case_branches = " ".join(
        f"WHEN '{label}' THEN {value}" for label, value in _PROVIDER_VALUES.items() if value is not None
    )
    op.execute(f'UPDATE "user" SET ai_provider_new = CASE ai_provider::text {case_branches} ELSE NULL END')

    # 3. Drop the old enum column, rename the new one into place, drop the ENUM type.
    op.drop_column("user", "ai_provider")
    op.alter_column("user", "ai_provider_new", new_column_name="ai_provider")
    op.execute("DROP TYPE IF EXISTS aiprovider")


def downgrade() -> None:
    aiprovider = postgresql.ENUM(*_PROVIDER_VALUES.keys(), name="aiprovider")
    aiprovider.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "user",
        sa.Column("ai_provider_old", sa.Enum(*_PROVIDER_VALUES.keys(), name="aiprovider"), nullable=True),
    )

    case_branches = " ".join(
        f"WHEN {value} THEN '{label}'" for label, value in _PROVIDER_VALUES.items() if value is not None
    )
    op.execute(f'UPDATE "user" SET ai_provider_old = (CASE ai_provider {case_branches} END)::aiprovider')

    op.drop_column("user", "ai_provider")
    op.alter_column("user", "ai_provider_old", new_column_name="ai_provider")
