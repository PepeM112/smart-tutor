from typing import Annotated, TypeAlias

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus
from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.models.answer import Answer
from app.schemas.answer import AnswerOverrideRequest, AnswerRead, ChallengeRequest
from app.schemas.test_result import TestResultRead
from app.services import challenge_service, grade_override_service, grading_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.post("/{answer_id}/challenge", response_model=AnswerRead)
def challenge(
    answer_id: str,
    request: ChallengeRequest,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> Answer:
    answer = challenge_service.challenge_answer(
        db,
        answer_id=answer_id,
        request=request,
        user_id=current_user.id,
    )
    background_tasks.add_task(challenge_service.process_challenge, answer.id)
    return answer


@router.put("/{answer_id}/override", response_model=TestResultRead)
def set_override(
    answer_id: str, data: AnswerOverrideRequest, db: DbSession, current_user: CurrentUser
) -> TestResultRead:
    """Teacher grade of one answer (classroom OWNER / EDITOR). Returns the updated result."""
    result = grade_override_service.set_override(db, answer_id=answer_id, score=data.score, current_user=current_user)
    # Only a teacher gets here (`grade_override_service` checks the role).
    return TestResultRead.model_validate(result).model_copy(update={"can_override": True})


@router.delete("/{answer_id}/override", response_model=TestResultRead)
def clear_override(
    answer_id: str, db: DbSession, current_user: CurrentUser, background_tasks: BackgroundTasks
) -> TestResultRead:
    """Remove the teacher grade: the AI grade counts again. An answer that was never graded by the AI is graded now."""
    result = grade_override_service.clear_override(db, answer_id=answer_id, current_user=current_user)
    if any(a.id == answer_id and a.status == int(AnswerStatus.PENDING) for a in result.answers):
        background_tasks.add_task(grading_service.grade_pending_answers, result.id)
    return TestResultRead.model_validate(result).model_copy(update={"can_override": True})
