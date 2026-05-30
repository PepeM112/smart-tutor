from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.crud import question as question_crud
from app.crud import test as test_crud
from app.models.question import Question
from app.models.user import User
from app.schemas.correction import QuestionCheckResponse
from app.schemas.question import QuestionUpdate, _validate_content
from app.services.correction_service import correct_question
from app.services.question_helpers import get_correct_answer_fields


def _get_owned_question_or_404(db: Session, *, question_id: str, current_user: User) -> Question:
    question = question_crud.get_by_id(db, id=question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    if question.test_id:
        test = test_crud.get_by_id(db, id=question.test_id)
        if test is None or test.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return question


def update_question(db: Session, *, question_id: str, current_user: User, data: QuestionUpdate) -> Question:
    question = _get_owned_question_or_404(db, question_id=question_id, current_user=current_user)
    if data.content is not None and data.question_type is None:
        _validate_content(question.question_type, data.content)
    return question_crud.update(db, question=question, data=data)


def delete_question(db: Session, *, question_id: str, current_user: User) -> None:
    question = _get_owned_question_or_404(db, question_id=question_id, current_user=current_user)
    question_crud.delete(db, question=question)


def check_question(
    db: Session, *, question_id: str, current_user: User, user_answer: str
) -> QuestionCheckResponse:
    question = _get_owned_question_or_404(db, question_id=question_id, current_user=current_user)
    answer_status = correct_question(user_answer, question)
    return QuestionCheckResponse(status=answer_status, **get_correct_answer_fields(question))
