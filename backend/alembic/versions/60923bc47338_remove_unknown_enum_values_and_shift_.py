"""remove unknown enum values and shift question group type

Revision ID: 60923bc47338
Revises: db41e11ba5e2
Create Date: 2026-08-16 19:23:58.935864

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '60923bc47338'
down_revision: Union[str, Sequence[str], None] = 'db41e11ba5e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # QuestionGroupType: UNKNOWN=0 removed, GENERIC=1 (new), VOCABULARY 1->2
    # Process VOCABULARY first (1->2), then UNKNOWN (0->1) to avoid collisions
    op.execute("UPDATE test_question_group SET type = 2 WHERE type = 1")
    op.execute("UPDATE test_question_group SET type = 1 WHERE type = 0")

    # NoteSource: UNKNOWN=0 removed — remap any 0 rows to USER_CREATED=1
    op.execute("UPDATE note SET source = 1 WHERE source = 0")

    # TokenUsage: UNKNOWN=0 removed for AIProvider and AIFeature
    # Any 0 rows would be invalid — remap to ANTHROPIC=1 / GRADING=1 as best-effort
    op.execute("UPDATE token_usage SET provider = 1 WHERE provider = 0")
    op.execute("UPDATE token_usage SET feature = 1 WHERE feature = 0")


def downgrade() -> None:
    # QuestionGroupType: reverse GENERIC=1->UNKNOWN=0, VOCABULARY=2->1
    # Process GENERIC first (1->0), then VOCABULARY (2->1)
    op.execute("UPDATE test_question_group SET type = 0 WHERE type = 1")
    op.execute("UPDATE test_question_group SET type = 1 WHERE type = 2")
