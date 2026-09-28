"""note version drop description

Revision ID: ce3be78835af
Revises: 0c4b6596b852
Create Date: 2026-09-24 19:13:18.631082

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ce3be78835af'
down_revision: Union[str, Sequence[str], None] = '0c4b6596b852'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add version column, remove description column from note."""
    op.add_column('note', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    op.drop_column('note', 'description')


def downgrade() -> None:
    """Restore description column, remove version column from note."""
    op.add_column('note', sa.Column('description', sa.VARCHAR(length=500), autoincrement=False, nullable=True))
    op.drop_column('note', 'version')
