from sqlalchemy.orm import Session

from app.crud import question as question_crud
from app.models.question import Question
from app.models.user import User


def get_review_questions(
    db: Session, *, current_user: User, limit: int, mode: str = "review"
) -> tuple[list[Question], bool]:
    """Return (questions, has_questions). In review mode, due questions first then new; in practice mode, random."""
    has_questions = question_crud.user_has_questions(db, user_id=current_user.id)

    if not has_questions:
        return [], False

    if mode == "practice":
        questions = question_crud.list_random_for_user(db, user_id=current_user.id, limit=limit)
        return questions, True

    due = question_crud.list_due_for_review(db, user_id=current_user.id, limit=limit)
    remaining = limit - len(due)

    if remaining > 0:
        new = question_crud.list_new_for_review(db, user_id=current_user.id, limit=remaining)
        due.extend(new)

    return due, True
