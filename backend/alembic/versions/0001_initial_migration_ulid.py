"""Initial migration with ULID primary keys

Revision ID: 0001_ulid
Revises:
Create Date: 2026-04-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_ulid"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables with ULID (VARCHAR 26) primary keys."""
    op.create_table(
        "user",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("UNKNOWN", "ACTIVE", "DELETED", "BLOCKED", name="userstatus"),
            nullable=False,
        ),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)
    op.create_index(op.f("ix_user_username"), "user", ["username"], unique=True)

    op.create_table(
        "test",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("user_id", sa.String(26), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_test_title"), "test", ["title"], unique=False)

    op.create_table(
        "question",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("question_type", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.String(), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("hint", sa.String(), nullable=True),
        sa.Column("explanation", sa.String(), nullable=True),
        sa.Column("test_id", sa.String(26), nullable=False),
        sa.ForeignKeyConstraint(["test_id"], ["test.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "test_result",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("test_id", sa.String(26), nullable=False),
        sa.Column("user_id", sa.String(26), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("correct_answers", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["test_id"], ["test.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "answer",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("test_result_id", sa.String(26), nullable=True),
        sa.Column("question_id", sa.String(26), nullable=False),
        sa.Column("user_answer", sa.String(), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["question.id"]),
        sa.ForeignKeyConstraint(["test_result_id"], ["test_result.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table("answer")
    op.drop_table("test_result")
    op.drop_table("question")
    op.drop_index(op.f("ix_test_title"), table_name="test")
    op.drop_table("test")
    op.drop_index(op.f("ix_user_username"), table_name="user")
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
    op.execute("DROP TYPE IF EXISTS userstatus")
