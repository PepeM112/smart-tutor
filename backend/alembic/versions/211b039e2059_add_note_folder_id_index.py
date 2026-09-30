"""add note folder_id index

Revision ID: 211b039e2059
Revises: c7a4e9d2b813
Create Date: 2026-09-30 08:34:15.320171

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "211b039e2059"
down_revision: str | Sequence[str] | None = "c7a4e9d2b813"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # The FK cascade on a folder delete finds notes by folder_id only; `ix_note_user_folder`
    # starts with user_id, so it can not serve that lookup.
    op.create_index(op.f("ix_note_folder_id"), "note", ["folder_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_note_folder_id"), table_name="note")
