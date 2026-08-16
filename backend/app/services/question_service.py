from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import QuestionType
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.models.question import Question
from app.models.test import Test
from app.models.user import User
from app.schemas.correction import QuestionCheckResponse
from app.schemas.question import QuestionUpdate, _validate_content
from app.services.correction_service import correct_question
from app.services.question_helpers import get_correct_answer_fields
from app.services.srs_service import record_answer
from app.services.versioning_service import version_test_if_needed


def _resolve_owning_test(db: Session, *, question: Question) -> Test | None:
    """Resolve the test that owns a question, either directly or through its group."""
    if question.test_id:
        return test_crud.get_by_id(db, id=question.test_id)
    if question.group_id and question.question_group:
        return question.question_group.test
    return None


def get_question(db: Session, *, question_id: str, current_user: User) -> Question:
    question = question_crud.get_by_id(db, id=question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    test = _resolve_owning_test(db, question=question)
    if test is None or test.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return question


def update_question(db: Session, *, question_id: str, current_user: User, data: QuestionUpdate) -> Question:
    question = get_question(db, question_id=question_id, current_user=current_user)
    test = _resolve_owning_test(db, question=question)
    if test:
        version_test_if_needed(db, test=test)
    if data.content is not None and data.question_type is None:
        _validate_content(QuestionType(question.question_type), data.content)
    updated = question_crud.update(db, question=question, data=data)
    db.commit()
    db.refresh(updated)
    return updated


def delete_question(db: Session, *, question_id: str, current_user: User) -> None:
    question = get_question(db, question_id=question_id, current_user=current_user)
    test = _resolve_owning_test(db, question=question)
    if test:
        version_test_if_needed(db, test=test)
    if question_crud.has_references(db, question_id=question.id):
        question_crud.soft_delete(db, question=question)
    else:
        question_crud.hard_delete(db, question=question)
    db.commit()


def check_question(
    db: Session, *, question_id: str, current_user: User, user_answer: str, update_srs: bool = True
) -> QuestionCheckResponse:
    question = get_question(db, question_id=question_id, current_user=current_user)
    answer_status = correct_question(user_answer, question)

    srs_state = None
    if update_srs:
        srs_state = record_answer(
            db,
            user_id=current_user.id,
            question_id=question_id,
            answer_status=answer_status,
            initial_ease_factor=current_user.initial_ease_factor,
        )
        db.commit()

    answer_fields = get_correct_answer_fields(question)
    return QuestionCheckResponse(
        status=answer_status,
        srs_state=srs_state,
        correct_answers=answer_fields.get("correct_answers"),
        correct_indices=answer_fields.get("correct_indices"),
    )
