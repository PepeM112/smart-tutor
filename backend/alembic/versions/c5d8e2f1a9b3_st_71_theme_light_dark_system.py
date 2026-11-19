"""ST-71 theme: map the old palette ids to light, dark or system

Revision ID: c5d8e2f1a9b3
Revises: ab32ee8727de
Create Date: 2026-11-19 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d8e2f1a9b3"
down_revision: str | Sequence[str] | None = "ab32ee8727de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Old palette ids that had a light look and a dark look. Any other old value becomes "system".
LIGHT_IDS = ("ocean-blue", "sky", "slate-minimal", "sunset", "coral", "forest", "mint", "sage")
DARK_IDS = ("midnight", "carbon", "neon", "noir")
NEW_VALUES = ("light", "dark", "system")


def upgrade() -> None:
    """Data migration only: the column stays String(20) with default "system"."""
    user = sa.table("user", sa.column("theme", sa.String))
    op.execute(user.update().where(user.c.theme.in_(LIGHT_IDS)).values(theme="light"))
    op.execute(user.update().where(user.c.theme.in_(DARK_IDS)).values(theme="dark"))
    op.execute(user.update().where(user.c.theme.notin_(NEW_VALUES)).values(theme="system"))


def downgrade() -> None:
    """No-op: the old palette ids cannot be restored."""
