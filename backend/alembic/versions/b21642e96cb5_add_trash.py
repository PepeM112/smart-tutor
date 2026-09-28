"""add trash (deleted_at on folder and note)

Revision ID: b21642e96cb5
Revises: 2ed8babb4ef5
Create Date: 2026-09-28 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b21642e96cb5"
down_revision: str | Sequence[str] | None = "2ed8babb4ef5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- folder ---
    op.add_column("folder", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_folder_deleted_at", "folder", ["deleted_at"], unique=False)

    # The Phase-1 sibling-uniqueness index was created unconditionally.
    # Recreate it with WHERE deleted_at IS NULL so trashed folders do not block new ones.
    op.execute("DROP INDEX IF EXISTS ix_folder_sibling_name")
    op.execute(
        """
        CREATE UNIQUE INDEX ix_folder_sibling_name
        ON folder (user_id, parent_id, lower(name))
        NULLS NOT DISTINCT
        WHERE deleted_at IS NULL
        """
    )

    # --- note ---
    op.add_column("note", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_note_deleted_at", "note", ["deleted_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # note
    op.drop_index("ix_note_deleted_at", table_name="note")
    op.drop_column("note", "deleted_at")

    # folder — restore the unconditional index
    op.execute("DROP INDEX IF EXISTS ix_folder_sibling_name")
    op.execute(
        """
        CREATE UNIQUE INDEX ix_folder_sibling_name
        ON folder (user_id, parent_id, lower(name))
        NULLS NOT DISTINCT
        """
    )
    op.drop_index("ix_folder_deleted_at", table_name="folder")
    op.drop_column("folder", "deleted_at")
