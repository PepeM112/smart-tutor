from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.enums import QuestionStatus, QuestionType, TestStatus
from app.models.answer import Answer
from app.models.question import Question
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.models.user_question_state import UserQuestionState
from app.schemas.question import QuestionCreate, QuestionUpdate


def get_by_id(db: Session, *, id: str) -> Question | None:
    stmt = select(Question).options(joinedload(Question.question_group)).where(Question.id == id)
    return db.execute(stmt).scalar_one_or_none()


def list_by_test(db: Session, *, test_id: str) -> Sequence[Question]:
    return db.scalars(select(Question).where(Question.test_id == test_id)).all()


def create_many(
    db: Session,
    *,
    questions: list[QuestionCreate],
    test_id: str | None = None,
    group_id: str | None = None,
) -> list[Question]:
    objs = [
        Question(
            test_id=test_id,
            group_id=group_id,
            question_type=int(q.question_type),
            prompt=q.prompt,
            content=q.content.model_dump(),
            hint=q.hint,
            explanation=q.explanation,
            order=q.order,
        )
        for q in questions
    ]
    db.add_all(objs)
    db.flush()
    return objs


def update(db: Session, *, question: Question, data: QuestionUpdate) -> Question:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    db.commit()
    db.refresh(question)
    return question


def has_references(db: Session, *, question_id: str) -> bool:
    """Check if a question has any answer or SRS state rows referencing it."""
    has_answer = db.execute(select(Answer.id).where(Answer.question_id == question_id).limit(1)).first()
    if has_answer:
        return True
    has_srs = db.execute(
        select(UserQuestionState.id).where(UserQuestionState.question_id == question_id).limit(1)
    ).first()
    return has_srs is not None


def soft_delete(db: Session, *, question: Question) -> None:
    question.status = int(QuestionStatus.DELETED)
    db.flush()


def hard_delete(db: Session, *, question: Question) -> None:
    db.delete(question)
    db.flush()


def list_random_for_user(db: Session, *, user_id: str, limit: int) -> Sequence[Question]:
    return db.scalars(_reviewable_base_query(user_id=user_id).order_by(func.random()).limit(limit)).all()


def _reviewable_base_query(*, user_id: str) -> Select[tuple[Question]]:
    # Questions reach their owning test through two paths:
    #   - Standalone: Question.test_id → Test.id
    #   - Grouped:    Question.group_id → TestQuestionGroup.test_id → Test.id
    # We outer-join both and coalesce to cover both cases.
    resolved_test_id = func.coalesce(Question.test_id, TestQuestionGroup.test_id)
    return (
        select(Question)
        .outerjoin(TestQuestionGroup, Question.group_id == TestQuestionGroup.id)
        .join(Test, resolved_test_id == Test.id)
        .where(
            Test.user_id == user_id,
            Test.status == int(TestStatus.ACTIVE),
            Question.status == int(QuestionStatus.ACTIVE),
            Question.question_type.in_([int(QuestionType.SIMPLE), int(QuestionType.MULTIPLE_CHOICE)]),
        )
    )


def list_due_for_review(db: Session, *, user_id: str, limit: int) -> Sequence[Question]:
    now = datetime.now(timezone.utc)
    stmt = (
        _reviewable_base_query(user_id=user_id)
        .join(UserQuestionState, UserQuestionState.question_id == Question.id)
        .where(
            UserQuestionState.user_id == user_id,
            UserQuestionState.next_review <= now,
        )
        .order_by(UserQuestionState.next_review.asc())
        .limit(limit)
    )
    return db.scalars(stmt).all()


def list_new_for_review(db: Session, *, user_id: str, limit: int) -> Sequence[Question]:
    stmt = (
        _reviewable_base_query(user_id=user_id)
        .outerjoin(
            UserQuestionState,
            (UserQuestionState.question_id == Question.id) & (UserQuestionState.user_id == user_id),
        )
        .where(UserQuestionState.id.is_(None))
        .order_by(func.random())
        .limit(limit)
    )
    return db.scalars(stmt).all()


def user_has_questions(db: Session, *, user_id: str) -> bool:
    stmt = _reviewable_base_query(user_id=user_id).limit(1)
    return db.execute(stmt).first() is not None
