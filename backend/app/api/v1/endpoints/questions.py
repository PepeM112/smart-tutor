from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.question import Question
from app.models.user import User
from app.schemas.question import QuestionRead, QuestionUpdate
from app.services import question_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.put("/{question_id}", response_model=QuestionRead)
def update(question_id: UUID, data: QuestionUpdate, db: DbSession, current_user: CurrentUser) -> Question:
    return question_service.update_question(db, question_id=question_id, current_user=current_user, data=data)


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(question_id: UUID, db: DbSession, current_user: CurrentUser) -> None:
    question_service.delete_question(db, question_id=question_id, current_user=current_user)
