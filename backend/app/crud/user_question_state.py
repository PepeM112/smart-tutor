from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_question_state import UserQuestionState


def get_by_user_and_question(db: Session, *, user_id: str, question_id: str) -> UserQuestionState | None:
    stmt = select(UserQuestionState).where(
        UserQuestionState.user_id == user_id,
        UserQuestionState.question_id == question_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def create(
    db: Session,
    *,
    user_id: str,
    question_id: str,
    ease_factor: float,
    interval: int,
    repetitions: int,
    next_review: datetime,
) -> UserQuestionState:
    state = UserQuestionState(
        user_id=user_id,
        question_id=question_id,
        ease_factor=ease_factor,
        interval=interval,
        repetitions=repetitions,
        next_review=next_review,
    )
    db.add(state)
    db.flush()
    return state


def update(
    db: Session,
    *,
    state: UserQuestionState,
    ease_factor: float,
    interval: int,
    repetitions: int,
    next_review: datetime,
) -> UserQuestionState:
    state.ease_factor = ease_factor
    state.interval = interval
    state.repetitions = repetitions
    state.next_review = next_review
    db.flush()
    return state
