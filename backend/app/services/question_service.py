from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import QuestionStatus, QuestionType
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.models.question import Question
from app.models.test import Test
from app.models.user import User
from app.schemas.correction import QuestionCheckResponse
from app.schemas.question import (
    LongTextContent,
    MultipleChoiceContent,
    QuestionCreateStandalone,
    QuestionGrouping,
    QuestionListRead,
    QuestionSortBy,
    QuestionUpdate,
    SimpleContent,
    SortOrder,
    _validate_content,
)
from app.services.correction_service import correct_question
from app.services.question_helpers import get_correct_answer_fields
from app.services.service_helpers import get_owned_or_404
from app.services.srs_service import record_answer
from app.services.versioning_service import version_test_if_needed

_CONTENT_MODEL_FOR_TYPE = {
    QuestionType.SIMPLE: SimpleContent,
    QuestionType.MULTIPLE_CHOICE: MultipleChoiceContent,
    QuestionType.LONG_TEXT: LongTextContent,
}


def _validate_stored_content(new_type: QuestionType, raw_content: dict[str, object]) -> None:
    model = _CONTENT_MODEL_FOR_TYPE.get(new_type)
    if model is None:
        return
    try:
        model.model_validate(raw_content)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Existing content is incompatible with type {new_type.name}",
        ) from exc


def _resolve_owning_test(db: Session, *, question: Question) -> Test | None:
    """Resolve the test that owns a question, either directly or through its group."""
    if question.test_id:
        return test_crud.get_by_id(db, id=question.test_id)
    if question.group_id and question.question_group:
        return question.question_group.test
    return None


def get_question(db: Session, *, question_id: str, current_user: User) -> Question:
    return get_owned_or_404(
        db, fetch=question_crud.get_by_id, id=question_id, current_user=current_user, entity_name="Question"
    )


def list_questions(
    db: Session,
    *,
    current_user: User,
    question_type: list[int] | None = None,
    test_id: list[str] | None = None,
    search: str | None = None,
    grouping: QuestionGrouping | None = None,
    sort_by: QuestionSortBy | None = None,
    sort_order: SortOrder = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[QuestionListRead], int]:
    questions, total = question_crud.list_by_user(
        db,
        user_id=current_user.id,
        question_type=question_type,
        test_id=test_id,
        search=search,
        grouping=grouping,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    items = [_to_question_list_read(q) for q in questions]
    return items, total


def create_question(db: Session, *, current_user: User, data: QuestionCreateStandalone) -> Question:
    question = question_crud.create_one(db, data=data, user_id=current_user.id)
    db.commit()
    db.refresh(question)
    return question


def _get_owned_test_or_404(db: Session, *, test_id: str, current_user: User) -> Test:
    return get_owned_or_404(db, fetch=test_crud.get_by_id, id=test_id, current_user=current_user, entity_name="Test")


# Groups and standalone questions share one order sequence per test
def _next_order_for_test(test: Test) -> int:
    max_order = max((q.order for q in test.questions), default=-1)
    max_group_order = max((g.order for g in test.question_groups), default=-1)
    return max(max_order, max_group_order) + 1


def assign_question_to_test(db: Session, *, question_id: str, test_id: str, current_user: User) -> Question:
    question = get_question(db, question_id=question_id, current_user=current_user)
    test = _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)

    assigned = question_crud.copy_to_test(
        db, source=question, user_id=current_user.id, test_id=test.id, order=_next_order_for_test(test)
    )
    db.commit()
    db.refresh(assigned)
    return assigned


def duplicate_question(db: Session, *, question_id: str, current_user: User) -> Question:
    """Copy any owned question (test-owned or bank) into the user's bank as a new standalone question."""
    question = get_question(db, question_id=question_id, current_user=current_user)
    duplicate = question_crud.duplicate_to_bank(db, source=question, user_id=current_user.id)
    db.commit()
    db.refresh(duplicate)
    return duplicate


def _delete_one_question(db: Session, *, question: Question, force_soft_delete: bool = False) -> None:
    """Version the owning test if needed, then soft- or hard-delete depending on references.

    Does not commit — callers own the transaction boundary.
    """
    test = _resolve_owning_test(db, question=question)
    if test:
        version_test_if_needed(db, test=test)
    if force_soft_delete or question_crud.has_references(db, question_id=question.id):
        question_crud.soft_delete(db, question=question)
    else:
        question_crud.hard_delete(db, question=question)


def bulk_delete_questions(
    db: Session,
    *,
    question_ids: list[str],
    current_user: User,
    force_soft_delete: bool = False,
    return_ids: bool = False,
) -> int | list[str]:
    """Delete every owned question in the batch. Questions the user doesn't own are skipped.

    When *return_ids* is True, returns the list of deleted question IDs instead of a count.
    """
    owned = [q for q in question_crud.list_by_ids(db, ids=question_ids) if q.user_id == current_user.id]
    owned_ids = [q.id for q in owned]
    for question in owned:
        _delete_one_question(db, question=question, force_soft_delete=force_soft_delete)
    db.commit()
    if return_ids:
        return owned_ids
    return len(owned)


def restore_questions(db: Session, *, question_ids: list[str], current_user: User) -> int:
    """Restore soft-deleted questions. Unowned or non-deleted questions are skipped."""
    all_questions = question_crud.list_by_ids(db, ids=question_ids)
    owned_deleted = [
        q for q in all_questions if q.user_id == current_user.id and q.status == int(QuestionStatus.DELETED)
    ]
    question_crud.bulk_restore(db, questions=owned_deleted)
    db.commit()
    return len(owned_deleted)


def bulk_assign_questions(db: Session, *, question_ids: list[str], test_id: str, current_user: User) -> int:
    """Copy every owned question in the batch into the target test. Unowned questions are skipped."""
    test = _get_owned_test_or_404(db, test_id=test_id, current_user=current_user)
    owned = [q for q in question_crud.list_by_ids(db, ids=question_ids) if q.user_id == current_user.id]

    start_order = _next_order_for_test(test)
    for offset, question in enumerate(owned):
        question_crud.copy_to_test(
            db, source=question, user_id=current_user.id, test_id=test.id, order=start_order + offset
        )
    db.commit()
    return len(owned)


def _to_question_list_read(question: Question) -> QuestionListRead:
    test_title = question.test.title if question.test else None
    group_title = question.question_group.title if question.question_group else None
    data = QuestionListRead.model_validate(question, from_attributes=True).model_dump()
    data["test_title"] = test_title
    data["group_title"] = group_title
    return QuestionListRead.model_validate(data)


def update_question(db: Session, *, question_id: str, current_user: User, data: QuestionUpdate) -> Question:
    question = get_question(db, question_id=question_id, current_user=current_user)
    test = _resolve_owning_test(db, question=question)
    if test:
        version_test_if_needed(db, test=test)
    if data.content is not None and data.question_type is None:
        _validate_content(QuestionType(question.question_type), data.content)
    elif data.question_type is not None and data.content is None:
        _validate_stored_content(QuestionType(data.question_type), question.content)
    updated = question_crud.update(db, question=question, data=data)
    db.commit()
    db.refresh(updated)
    return updated


def delete_question(db: Session, *, question_id: str, current_user: User) -> None:
    question = get_question(db, question_id=question_id, current_user=current_user)
    _delete_one_question(db, question=question)
    db.commit()


def check_question(
    db: Session, *, question_id: str, current_user: User, user_answer: str, update_srs: bool = True
) -> QuestionCheckResponse:
    question = get_question(db, question_id=question_id, current_user=current_user)
    if QuestionType(question.question_type) == QuestionType.LONG_TEXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Long Text questions require async AI grading and cannot be checked synchronously",
        )
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
