"""ST-68 Phase B: token_usage.key_source (which key paid for the call)

Revision ID: d7e3b9c1a5f2
Revises: c4d9a2e7b1f3
Create Date: 2026-10-18 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7e3b9c1a5f2'
down_revision: Union[str, Sequence[str], None] = 'c4d9a2e7b1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# KeySource.STUDENT: every row from before this migration was paid with the user's own key.
_STUDENT = '1'


def upgrade() -> None:
    op.add_column('token_usage', sa.Column('key_source', sa.Integer(), server_default=_STUDENT, nullable=False))
    # The cap query reads the Class-key spend of one student in a classroom.
    op.create_index('ix_token_usage_user_space_source', 'token_usage', ['user_id', 'space_id', 'key_source'])


def downgrade() -> None:
    op.drop_index('ix_token_usage_user_space_source', table_name='token_usage')
    op.drop_column('token_usage', 'key_source')
