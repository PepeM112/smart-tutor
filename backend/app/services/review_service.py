"""
Review service — fetches random questions for ephemeral review sessions.

SRS scheduling is not yet implemented; questions are selected at random.
"""

from typing import List

from sqlalchemy.orm import Session

from app.crud import question as question_crud
from app.models.question import Question
from app.models.user import User


def get_review_questions(db: Session, *, current_user: User, limit: int) -> List[Question]:
    """Return up to *limit* random questions across all the user's tests."""
    return question_crud.list_random_for_user(db, user_id=current_user.id, limit=limit)
