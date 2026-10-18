from sqlalchemy.orm import Session

from app.crud import question as question_crud
from app.crud.question import REVIEW_SCOPE_ALL
from app.models.question import Question
from app.models.user import User
from app.schemas.user_question_state import ReviewMode


def get_review_questions(
    db: Session, *, current_user: User, limit: int, mode: ReviewMode = "review", scope: str = REVIEW_SCOPE_ALL
) -> tuple[list[Question], bool]:
    """Return (questions, has_questions). In review mode, due questions first then new; in practice mode, random.

    `scope`: "all" (personal + the courses with Include in Review on), "personal", or one course id.

    `limit` is capped by the user's `daily_review_limit` when they set one.
    """
    if current_user.daily_review_limit:
        limit = min(limit, current_user.daily_review_limit)
    has_questions = question_crud.user_has_questions(db, user_id=current_user.id, scope=scope)

    if not has_questions:
        return [], False

    if mode == "practice":
        questions = list(question_crud.list_random_for_user(db, user_id=current_user.id, limit=limit, scope=scope))
        return questions, True

    due = list(question_crud.list_due_for_review(db, user_id=current_user.id, limit=limit, scope=scope))
    remaining = limit - len(due)

    if remaining > 0:
        new = question_crud.list_new_for_review(db, user_id=current_user.id, limit=remaining, scope=scope)
        due.extend(new)

    return due, True
