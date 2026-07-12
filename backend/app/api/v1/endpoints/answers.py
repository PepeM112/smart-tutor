from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.answer import AnswerRead, ChallengeRequest
from app.services import challenge_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/{answer_id}/challenge", response_model=AnswerRead)
def challenge(
    answer_id: str,
    request: ChallengeRequest,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> AnswerRead:
    answer = challenge_service.challenge_answer(
        db,
        answer_id=answer_id,
        request=request,
        user_id=current_user.id,
    )
    background_tasks.add_task(challenge_service.process_challenge, answer.id)
    return AnswerRead.model_validate(answer)
