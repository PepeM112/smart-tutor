"""Teacher grade override of one answer in a classroom test result (ST-68 Phase B, R35).

Rules:
- Only an OWNER / EDITOR of the classroom (or of one of its courses) may override. A standalone course has no
  teacher grades (R12): 400.
- The override has points (0 up to the points of the question). The status comes from the points. The AI
  grade stays in `status` / `rubric_result`.
- The effective grade is the override when set, else the AI grade (`grading_service.recalculate_test_result`).
- An override works on a PENDING Long Text answer too. The background grader never writes the override columns.
- A pass created by an override writes the completion row. A fail override never removes a completion row:
  progress is sticky (same rule as a low score after a pass). To undo a pass, a teacher resets the item progress.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus
from app.crud import answer as answer_crud
from app.crud import question as question_crud
from app.crud import test_result as test_result_crud
from app.models.answer import Answer
from app.models.question import Question
from app.models.test_result import TestResult
from app.models.user import User
from app.services import space_progress_service
from app.services.access_service import EDIT_ROLES, is_classroom_space, resolve_role, result_item_and_space
from app.services.grading_service import recalculate_test_result
from app.services.space_service import require_active


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _get_reviewable(db: Session, *, answer_id: str, current_user: User) -> tuple[Answer, TestResult, Question]:
    """The answer, its result and its question, after the teacher checks."""
    answer = answer_crud.get_by_id_with_test_result(db, id=answer_id)
    if answer is None or answer.test_result is None:
        raise _not_found("Answer not found")
    result = answer.test_result

    found = result_item_and_space(db, result=result)
    # A personal result, or a viewer, gets 403. We do not tell a stranger more.
    if found is None or resolve_role(db, space=found[1], user_id=current_user.id) not in EDIT_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not is_classroom_space(found[1]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Grade overrides are only available in classrooms"
        )
    require_active(db, found[1])

    question = question_crud.get_by_id(db, id=answer.question_id)
    if question is None:
        raise _not_found("Question not found")
    return answer, result, question


def _status_for(score: float, points: float) -> AnswerStatus:
    if score >= points:
        return AnswerStatus.CORRECT
    if score <= 0:
        return AnswerStatus.WRONG
    return AnswerStatus.PARTIAL


def _refresh_result(db: Session, result: TestResult) -> TestResult:
    """Lock the result and read it again. The caller changes the answer, recalculates, rechecks and commits."""
    test_result_crud.lock(db, id=result.id)
    # A background grader may have changed the rows while we waited for the lock.
    db.expire_all()
    fresh = test_result_crud.get_by_id(db, id=result.id)
    if fresh is None:
        raise _not_found("Test result not found")
    return fresh


def set_override(db: Session, *, answer_id: str, score: float, current_user: User) -> TestResult:
    """Give `score` points to the answer. Returns the updated result."""
    answer, result, question = _get_reviewable(db, answer_id=answer_id, current_user=current_user)
    if score > question.points:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The score must be between 0 and {question.points:g}",
        )
    result = _refresh_result(db, result)
    target = next(a for a in result.answers if a.id == answer.id)
    target.override_score = score
    target.override_status = int(_status_for(score, question.points))
    target.overridden_by = current_user.id
    target.overridden_at = datetime.now(timezone.utc)
    recalculate_test_result(db, result)
    space_progress_service.recheck_result_completion(db, test_result=result)
    db.commit()
    db.refresh(result)
    return result


def clear_override(db: Session, *, answer_id: str, current_user: User) -> TestResult:
    """Remove the override: the AI grade counts again (a PENDING answer is PENDING again)."""
    answer, result, _question = _get_reviewable(db, answer_id=answer_id, current_user=current_user)
    result = _refresh_result(db, result)
    target = next(a for a in result.answers if a.id == answer.id)
    target.override_score = None
    target.override_status = None
    target.overridden_by = None
    target.overridden_at = None
    recalculate_test_result(db, result)
    space_progress_service.recheck_result_completion(db, test_result=result)
    db.commit()
    db.refresh(result)
    return result
