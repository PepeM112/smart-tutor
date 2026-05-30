from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.enums import QuestionType
from app.models.question import Question
from app.models.test import Test
from app.schemas.question import QuestionCreate, QuestionUpdate


def get_by_id(db: Session, *, id: str) -> Optional[Question]:
    return db.query(Question).filter(Question.id == id).first()


def list_by_test(db: Session, *, test_id: str) -> List[Question]:
    return db.query(Question).filter(Question.test_id == test_id).all()


def create_many(
    db: Session,
    *,
    questions: List[QuestionCreate],
    test_id: Optional[str] = None,
    group_id: Optional[str] = None,
) -> List[Question]:
    objs = [
        Question(
            test_id=test_id,
            group_id=group_id,
            question_type=int(q.question_type),
            prompt=q.prompt,
            content=q.content,
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


def delete(db: Session, *, question: Question) -> None:
    db.delete(question)
    db.commit()


def list_random_for_user(db: Session, *, user_id: str, limit: int) -> List[Question]:
    """Return up to *limit* random SIMPLE/MC questions across all the user's tests."""
    return (
        db.query(Question)
        .join(Test, Question.test_id == Test.id)
        .filter(
            Test.user_id == user_id,
            Question.question_type.in_([int(QuestionType.SIMPLE), int(QuestionType.MULTIPLE_CHOICE)]),
        )
        .order_by(func.random())
        .limit(limit)
        .all()
    )
