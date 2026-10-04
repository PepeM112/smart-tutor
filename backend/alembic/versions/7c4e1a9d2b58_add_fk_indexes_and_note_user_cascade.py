"""add fk indexes and note user cascade

Revision ID: 7c4e1a9d2b58
Revises: 3b3a78595fc9
Create Date: 2026-10-04 18:10:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7c4e1a9d2b58'
down_revision: str | Sequence[str] | None = '3b3a78595fc9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, column) pairs that get a plain index. Names follow the `ix_<table>_<column>` convention.
_FK_INDEXES: list[tuple[str, str]] = [
    ('test', 'user_id'),
    ('test_result', 'user_id'),
    ('test_result', 'test_id'),
    ('answer', 'test_result_id'),
    ('answer', 'question_id'),
    ('question', 'test_id'),
    ('question', 'group_id'),
    ('test_question_group', 'test_id'),
]


def upgrade() -> None:
    """Upgrade schema."""
    for table, column in _FK_INDEXES:
        op.create_index(op.f(f'ix_{table}_{column}'), table, [column], unique=False)

    # Same as `folder.user_id`: deleting a user also deletes their notes.
    op.drop_constraint('note_user_id_fkey', 'note', type_='foreignkey')
    op.create_foreign_key('note_user_id_fkey', 'note', 'user', ['user_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('note_user_id_fkey', 'note', type_='foreignkey')
    op.create_foreign_key('note_user_id_fkey', 'note', 'user', ['user_id'], ['id'])

    for table, column in reversed(_FK_INDEXES):
        op.drop_index(op.f(f'ix_{table}_{column}'), table_name=table)
