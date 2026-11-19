"""ST-71 theme: map the old palette ids to light, dark or system

Revision ID: c5d8e2f1a9b3
Revises: ab32ee8727de
Create Date: 2026-11-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d8e2f1a9b3'
down_revision: Union[str, Sequence[str], None] = 'ab32ee8727de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Old palette ids that had a light look and a dark look. Any other old value becomes "system".
LIGHT_IDS = ("ocean-blue", "sky", "slate-minimal", "sunset", "coral", "forest", "mint", "sage")
DARK_IDS = ("midnight", "carbon", "neon", "noir")
NEW_VALUES = ("light", "dark", "system")


def map_theme(old: str) -> str:
    if old in NEW_VALUES:
        return old
    if old in LIGHT_IDS:
        return "light"
    if old in DARK_IDS:
        return "dark"
    return "system"


def upgrade() -> None:
    """Data migration only: the column stays String(20) with default "system"."""
    user = sa.table("user", sa.column("theme", sa.String))
    op.execute(user.update().where(user.c.theme.in_(LIGHT_IDS)).values(theme="light"))
    op.execute(user.update().where(user.c.theme.in_(DARK_IDS)).values(theme="dark"))
    op.execute(user.update().where(user.c.theme.notin_(NEW_VALUES)).values(theme="system"))


def downgrade() -> None:
    """No-op: the old palette ids cannot be restored."""
