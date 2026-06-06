from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus
from app.crud import user_question_state as uqs_crud
from app.schemas.user_question_state import SRSStateResponse

SM2_QUALITY_MAP = {
    AnswerStatus.CORRECT: 5,
    AnswerStatus.PARTIAL: 3,
    AnswerStatus.WRONG: 1,
}

EASE_FLOOR = 1.3


@dataclass
class SM2Result:
    ease_factor: float
    interval: int
    repetitions: int
    next_review: datetime


def apply_sm2(
    *,
    quality: int,
    ease_factor: float = 2.5,
    interval: int = 0,
    repetitions: int = 0,
) -> SM2Result:
    """Pure SM-2 calculation. Returns the new scheduling state."""
    if quality >= 3:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)
        new_repetitions = repetitions + 1
    else:
        new_interval = 1
        new_repetitions = 0

    new_ease = ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    new_ease = max(EASE_FLOOR, new_ease)

    return SM2Result(
        ease_factor=new_ease,
        interval=new_interval,
        repetitions=new_repetitions,
        next_review=datetime.now(timezone.utc) + timedelta(days=new_interval),
    )


def record_answer(db: Session, *, user_id: str, question_id: str, answer_status: AnswerStatus) -> SRSStateResponse:
    """Orchestrate SRS state update: get-or-create state, apply SM-2, persist."""
    quality = SM2_QUALITY_MAP.get(answer_status, 1)
    state = uqs_crud.get_by_user_and_question(db, user_id=user_id, question_id=question_id)

    if state is None:
        result = apply_sm2(quality=quality)
        state = uqs_crud.create(
            db,
            user_id=user_id,
            question_id=question_id,
            ease_factor=result.ease_factor,
            interval=result.interval,
            repetitions=result.repetitions,
            next_review=result.next_review,
        )
    else:
        result = apply_sm2(
            quality=quality,
            ease_factor=state.ease_factor,
            interval=state.interval,
            repetitions=state.repetitions,
        )
        state = uqs_crud.update(
            db,
            state=state,
            ease_factor=result.ease_factor,
            interval=result.interval,
            repetitions=result.repetitions,
            next_review=result.next_review,
        )

    return SRSStateResponse(
        ease_factor=state.ease_factor,
        interval=state.interval,
        repetitions=state.repetitions,
        next_review=state.next_review,
    )
