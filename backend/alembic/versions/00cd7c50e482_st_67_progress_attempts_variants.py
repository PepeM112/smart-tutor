"""ST-67 progress attempts variants

Revision ID: 00cd7c50e482
Revises: ae673701afd4
Create Date: 2026-10-17 23:30:31.771239

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '00cd7c50e482'
down_revision: Union[str, Sequence[str], None] = 'ae673701afd4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kind 1 = NOTE, 2 = TEST, 3 = COURSE (SpaceItemKind). Frozen here: a migration must not import app code.
_NEW_CHECK = (
    "(kind = 1 AND note_id IS NOT NULL AND child_space_id IS NULL)"
    " OR (kind = 2 AND note_id IS NULL AND child_space_id IS NULL)"
    " OR (kind = 3 AND child_space_id IS NOT NULL AND note_id IS NULL)"
)
_OLD_CHECK = (
    "(kind = 1 AND note_id IS NOT NULL AND test_id IS NULL AND child_space_id IS NULL)"
    " OR (kind = 2 AND test_id IS NOT NULL AND note_id IS NULL AND child_space_id IS NULL)"
    " OR (kind = 3 AND child_space_id IS NOT NULL AND note_id IS NULL AND test_id IS NULL)"
)



def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('space_item_completion',
    sa.Column('item_id', sa.String(length=26), nullable=False),
    sa.Column('user_id', sa.String(length=26), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['item_id'], ['space_item.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('item_id', 'user_id')
    )
    op.create_index(op.f('ix_space_item_completion_user_id'), 'space_item_completion', ['user_id'], unique=False)
    op.create_table('space_item_test',
    sa.Column('item_id', sa.String(length=26), nullable=False),
    sa.Column('test_id', sa.String(length=26), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['item_id'], ['space_item.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['test_id'], ['test.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('item_id', 'test_id')
    )
    op.create_index(op.f('ix_space_item_test_test_id'), 'space_item_test', ['test_id'], unique=False)
    op.create_table('space_attempt',
    sa.Column('id', sa.String(length=26), nullable=False),
    sa.Column('item_id', sa.String(length=26), nullable=False),
    sa.Column('user_id', sa.String(length=26), nullable=False),
    sa.Column('test_id', sa.String(length=26), nullable=False),
    sa.Column('test_version', sa.Integer(), nullable=False),
    sa.Column('status', sa.Integer(), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deadline_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('test_result_id', sa.String(length=26), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['item_id'], ['space_item.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['test_id'], ['test.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['test_result_id'], ['test_result.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_space_attempt_test_id'), 'space_attempt', ['test_id'], unique=False)
    op.create_index('ix_space_attempt_user_item', 'space_attempt', ['user_id', 'item_id'], unique=False)
    op.create_index('uq_space_attempt_open', 'space_attempt', ['user_id', 'item_id'], unique=True, postgresql_where='status = 1')
    op.add_column('space_item', sa.Column('pass_threshold', sa.Float(), server_default='0.5', nullable=False))
    op.add_column('space_item', sa.Column('max_attempts', sa.Integer(), nullable=True))
    op.add_column('space_item', sa.Column('cooldown_hours', sa.Integer(), nullable=True))
    op.add_column('space_item', sa.Column('reveal_answers', sa.Integer(), server_default='2', nullable=False))
    op.add_column('space_item', sa.Column('time_limit_minutes', sa.Integer(), nullable=True))
    # Move the single test of each TEST item into `space_item_test` (position 0), then drop the column.
    op.execute(
        "INSERT INTO space_item_test (item_id, test_id, position) "
        "SELECT id, test_id, 0 FROM space_item WHERE test_id IS NOT NULL"
    )
    # The old check needs `test_id`: drop it before the column, then add the check without `test_id`.
    op.drop_constraint('ck_space_item_target', 'space_item', type_='check')
    op.drop_index(op.f('ix_space_item_test_id'), table_name='space_item')
    op.drop_constraint(op.f('space_item_test_id_fkey'), 'space_item', type_='foreignkey')
    op.drop_column('space_item', 'test_id')
    op.create_check_constraint('ck_space_item_target', 'space_item', _NEW_CHECK)
    op.add_column('space_member', sa.Column('include_in_srs', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('space_member', sa.Column('last_item_id', sa.String(length=26), nullable=True))
    op.add_column('space_member', sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('space_member', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key('space_member_last_item_id_fkey', 'space_member', 'space_item', ['last_item_id'], ['id'], ondelete='SET NULL')
    op.add_column('test_result', sa.Column('space_item_id', sa.String(length=26), nullable=True))
    op.create_index(op.f('ix_test_result_space_item_id'), 'test_result', ['space_item_id'], unique=False)
    op.create_foreign_key('test_result_space_item_id_fkey', 'test_result', 'space_item', ['space_item_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('test_result_space_item_id_fkey', 'test_result', type_='foreignkey')
    op.drop_index(op.f('ix_test_result_space_item_id'), table_name='test_result')
    op.drop_column('test_result', 'space_item_id')
    op.drop_constraint('space_member_last_item_id_fkey', 'space_member', type_='foreignkey')
    op.drop_column('space_member', 'completed_at')
    op.drop_column('space_member', 'last_accessed_at')
    op.drop_column('space_member', 'last_item_id')
    op.drop_column('space_member', 'include_in_srs')
    op.add_column('space_item', sa.Column('test_id', sa.VARCHAR(length=26), autoincrement=False, nullable=True))
    op.create_foreign_key(op.f('space_item_test_id_fkey'), 'space_item', 'test', ['test_id'], ['id'], ondelete='CASCADE')
    op.create_index(op.f('ix_space_item_test_id'), 'space_item', ['test_id'], unique=False)
    # Each TEST item keeps its first variant (the lowest position). Other variants are lost.
    op.execute(
        "UPDATE space_item SET test_id = ("
        "SELECT sit.test_id FROM space_item_test sit WHERE sit.item_id = space_item.id "
        "ORDER BY sit.position, sit.test_id LIMIT 1) WHERE kind = 2"
    )
    # A TEST item with no variant can not satisfy the old check: remove it.
    op.execute("DELETE FROM space_item WHERE kind = 2 AND test_id IS NULL")
    op.drop_constraint('ck_space_item_target', 'space_item', type_='check')
    op.create_check_constraint('ck_space_item_target', 'space_item', _OLD_CHECK)
    op.drop_column('space_item', 'time_limit_minutes')
    op.drop_column('space_item', 'reveal_answers')
    op.drop_column('space_item', 'cooldown_hours')
    op.drop_column('space_item', 'max_attempts')
    op.drop_column('space_item', 'pass_threshold')
    op.drop_index('uq_space_attempt_open', table_name='space_attempt', postgresql_where='status = 1')
    op.drop_index('ix_space_attempt_user_item', table_name='space_attempt')
    op.drop_index(op.f('ix_space_attempt_test_id'), table_name='space_attempt')
    op.drop_table('space_attempt')
    op.drop_index(op.f('ix_space_item_test_test_id'), table_name='space_item_test')
    op.drop_table('space_item_test')
    op.drop_index(op.f('ix_space_item_completion_user_id'), table_name='space_item_completion')
    op.drop_table('space_item_completion')
