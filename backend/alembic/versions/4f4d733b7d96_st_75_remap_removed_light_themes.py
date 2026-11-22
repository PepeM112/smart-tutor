"""ST-75 remap removed light themes

Revision ID: 4f4d733b7d96
Revises: b3298d08be0e
Create Date: 2026-11-21 17:58:01.265072

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4f4d733b7d96"
down_revision: str | Sequence[str] | None = "b3298d08be0e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Removed theme id -> the theme that replaces it. Same map as `LEGACY_THEME_IDS` in the frontend `lib/themes.ts`.
REMAPPED_THEMES = {
    "light-sand": "light",
    "light-clay": "light",
    "light-clay-soft": "light",
    "light-clay-mist": "light",
    "light-clay-frame": "light-frame",
}


def upgrade() -> None:
    """Data migration only: the column stays String(20) with default "system"."""
    user = sa.table("user", sa.column("theme", sa.String))
    for removed, replacement in REMAPPED_THEMES.items():
        op.execute(user.update().where(user.c.theme == removed).values(theme=replacement))


def downgrade() -> None:
    """No-op: five removed ids became two, so the original value of a user cannot be restored.

    The old values are also not valid for the code of this revision, so keeping the new ones is safe.
    """
