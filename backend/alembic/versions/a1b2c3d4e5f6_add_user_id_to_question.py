"""add user_id to question

Revision ID: a1b2c3d4e5f6
Revises: 74880ffd2725
Create Date: 2026-08-11 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "74880ffd2725"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add user_id FK to question, backfill from owning test, then make non-nullable."""
    # Step 1: add nullable column
    op.add_column("question", sa.Column("user_id", sa.String(length=26), nullable=True))

    # Step 2: backfill from test.user_id (covers both standalone and grouped questions)
    op.execute(
        """
        UPDATE question
        SET user_id = t.user_id
        FROM test t
        WHERE question.test_id = t.id
          AND question.user_id IS NULL
        """
    )
    # Backfill grouped questions that have no direct test_id but have a group_id
    op.execute(
        """
        UPDATE question
        SET user_id = t.user_id
        FROM test_question_group g
        JOIN test t ON g.test_id = t.id
        WHERE question.group_id = g.id
          AND question.user_id IS NULL
        """
    )

    # Step 3: make non-nullable + add FK and index
    op.alter_column("question", "user_id", nullable=False)
    op.create_foreign_key(None, "question", "user", ["user_id"], ["id"])
    op.create_index(op.f("ix_question_user_id"), "question", ["user_id"], unique=False)


def downgrade() -> None:
    """Remove user_id from question."""
    op.drop_index(op.f("ix_question_user_id"), table_name="question")
    op.drop_constraint(None, "question", type_="foreignkey")
    op.drop_column("question", "user_id")
