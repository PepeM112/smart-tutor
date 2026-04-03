from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.question import Question
from app.models.user import User
from app.schemas.correction import QuestionCheckRequest, QuestionCheckResponse
from app.schemas.question import QuestionRead, QuestionUpdate
from app.services import question_service
from app.services.correction_service import correct_question

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.put("/{question_id}", response_model=QuestionRead)
def update(question_id: str, data: QuestionUpdate, db: DbSession, current_user: CurrentUser) -> Question:
    return question_service.update_question(db, question_id=question_id, current_user=current_user, data=data)


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(question_id: str, db: DbSession, current_user: CurrentUser) -> None:
    question_service.delete_question(db, question_id=question_id, current_user=current_user)


@router.post("/{question_id}/check", response_model=QuestionCheckResponse)
def check(
    question_id: str, data: QuestionCheckRequest, db: DbSession, current_user: CurrentUser
) -> QuestionCheckResponse:
    """Check a single question answer. Returns the answer status. No side effects (yet — SRS will use this)."""
    question = question_crud.get_by_id(db, id=question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    answer_status = correct_question(data.user_answer, question)
    return QuestionCheckResponse(status=answer_status)
