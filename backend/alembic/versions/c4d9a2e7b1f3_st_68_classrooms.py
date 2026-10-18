"""ST-68 classrooms: scheduling, inherited member role, classroom settings, override and token space

Revision ID: c4d9a2e7b1f3
Revises: b3c8e1f4a7d2
Create Date: 2026-10-18 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d9a2e7b1f3'
down_revision: Union[str, Sequence[str], None] = 'b3c8e1f4a7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# FeedPermission.STUDENTS_COMMENT, KeyPriority.CLASS, KeyScope.CLASSROOM_CONTENT
_FEED_DEFAULT, _PRIORITY_DEFAULT, _SCOPE_DEFAULT = '2', '2', '1'


def upgrade() -> None:
    # Scheduling of items.
    op.add_column('space_item', sa.Column('due_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('space_item', sa.Column('opens_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('space_item', sa.Column('closes_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('space_item', sa.Column('visible_from', sa.DateTime(timezone=True), nullable=True))

    # NULL role = inherit the role of the parent classroom. The CHECK (role != OWNER) stays: NULL passes it.
    op.alter_column('space_member', 'role', existing_type=sa.Integer(), nullable=True)

    op.create_table(
        'classroom_settings',
        sa.Column('space_id', sa.String(length=26), nullable=False),
        sa.Column('feed_permission', sa.Integer(), server_default=_FEED_DEFAULT, nullable=False),
        sa.Column('ai_provider', sa.Integer(), nullable=True),
        sa.Column('encrypted_class_key', sa.Text(), nullable=True),
        sa.Column('key_priority', sa.Integer(), server_default=_PRIORITY_DEFAULT, nullable=False),
        sa.Column('key_scope', sa.Integer(), server_default=_SCOPE_DEFAULT, nullable=False),
        sa.Column('monthly_token_cap_per_student', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['space_id'], ['space.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('space_id'),
    )

    # Phase B columns (teacher override, spend per classroom). The logic comes later.
    op.add_column('answer', sa.Column('override_score', sa.Float(), nullable=True))
    op.add_column('answer', sa.Column('override_status', sa.Integer(), nullable=True))
    op.add_column('answer', sa.Column('overridden_by', sa.String(length=26), nullable=True))
    op.add_column('answer', sa.Column('overridden_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key('fk_answer_overridden_by_user', 'answer', 'user', ['overridden_by'], ['id'], ondelete='SET NULL')
    op.add_column('token_usage', sa.Column('space_id', sa.String(length=26), nullable=True))
    op.create_index(op.f('ix_token_usage_space_id'), 'token_usage', ['space_id'], unique=False)
    op.create_foreign_key('fk_token_usage_space_id_space', 'token_usage', 'space', ['space_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_token_usage_space_id_space', 'token_usage', type_='foreignkey')
    op.drop_index(op.f('ix_token_usage_space_id'), table_name='token_usage')
    op.drop_column('token_usage', 'space_id')

    op.drop_constraint('fk_answer_overridden_by_user', 'answer', type_='foreignkey')
    op.drop_column('answer', 'overridden_at')
    op.drop_column('answer', 'overridden_by')
    op.drop_column('answer', 'override_status')
    op.drop_column('answer', 'override_score')

    op.drop_table('classroom_settings')

    # Lazy rows (NULL role) hold only personal state of a classroom course. They can not exist without the column.
    op.execute('DELETE FROM space_member WHERE role IS NULL')
    op.alter_column('space_member', 'role', existing_type=sa.Integer(), nullable=False)

    op.drop_column('space_item', 'visible_from')
    op.drop_column('space_item', 'closes_at')
    op.drop_column('space_item', 'opens_at')
    op.drop_column('space_item', 'due_at')
