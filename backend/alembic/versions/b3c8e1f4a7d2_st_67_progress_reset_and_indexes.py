"""ST-67 progress reset and indexes

Revision ID: b3c8e1f4a7d2
Revises: 00cd7c50e482
Create Date: 2026-10-18 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c8e1f4a7d2'
down_revision: Union[str, Sequence[str], None] = '00cd7c50e482'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('space_item', sa.Column('progress_reset_at', sa.DateTime(timezone=True), nullable=True))
    # The FK cascades (item delete, result delete) scan these columns without an index.
    op.create_index(op.f('ix_space_attempt_item_id'), 'space_attempt', ['item_id'], unique=False)
    op.create_index(op.f('ix_space_attempt_test_result_id'), 'space_attempt', ['test_result_id'], unique=False)
    op.create_index(op.f('ix_space_member_last_item_id'), 'space_member', ['last_item_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_space_member_last_item_id'), table_name='space_member')
    op.drop_index(op.f('ix_space_attempt_test_result_id'), table_name='space_attempt')
    op.drop_index(op.f('ix_space_attempt_item_id'), table_name='space_attempt')
    op.drop_column('space_item', 'progress_reset_at')
