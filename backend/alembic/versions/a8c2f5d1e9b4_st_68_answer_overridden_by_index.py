"""ST-68 audit: index on answer.overridden_by (FK, used when a user is deleted)

Revision ID: a8c2f5d1e9b4
Revises: d7e3b9c1a5f2
Create Date: 2026-10-18 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a8c2f5d1e9b4'
down_revision: Union[str, Sequence[str], None] = 'd7e3b9c1a5f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(op.f('ix_answer_overridden_by'), 'answer', ['overridden_by'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_answer_overridden_by'), table_name='answer')
