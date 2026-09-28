"""add folders

Revision ID: 2ed8babb4ef5
Revises: ce3be78835af
Create Date: 2026-09-28 14:34:20.531822

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2ed8babb4ef5"
down_revision: str | Sequence[str] | None = "ce3be78835af"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "folder",
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.Column("user_id", sa.String(length=26), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("parent_id", sa.String(length=26), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["folder.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_folder_parent_id", "folder", ["parent_id"], unique=False)
    # Case-insensitive sibling uniqueness: same name in the same parent is disallowed.
    # NULLS NOT DISTINCT ensures root-level folders (parent_id IS NULL) are also deduplicated.
    op.execute(
        """
        CREATE UNIQUE INDEX ix_folder_sibling_name
        ON folder (user_id, parent_id, lower(name))
        NULLS NOT DISTINCT
        """
    )

    op.add_column("note", sa.Column("folder_id", sa.String(length=26), nullable=True))
    op.create_index("ix_note_user_folder", "note", ["user_id", "folder_id"], unique=False)
    op.create_foreign_key(
        "fk_note_folder_id",
        "note",
        "folder",
        ["folder_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_note_folder_id", "note", type_="foreignkey")
    op.drop_index("ix_note_user_folder", table_name="note")
    op.drop_column("note", "folder_id")

    op.execute("DROP INDEX IF EXISTS ix_folder_sibling_name")
    op.drop_index("ix_folder_parent_id", table_name="folder")
    op.drop_table("folder")
