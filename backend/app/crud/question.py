from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.question import Question
from app.schemas.question import QuestionCreate, QuestionUpdate


def get_by_id(db: Session, *, id: str) -> Optional[Question]:
    return db.query(Question).filter(Question.id == id).first()


def list_by_test(db: Session, *, test_id: str) -> List[Question]:
    return db.query(Question).filter(Question.test_id == test_id).all()


def create(db: Session, *, test_id: str, data: QuestionCreate) -> Question:
    question = Question(
        test_id=test_id,
        question_type=int(data.question_type),
        prompt=data.prompt,
        content=data.content,
        hint=data.hint,
        explanation=data.explanation,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def create_many(db: Session, *, test_id: str, questions: List[QuestionCreate]) -> List[Question]:
    objs = [
        Question(
            test_id=test_id,
            question_type=int(q.question_type),
            prompt=q.prompt,
            content=q.content,
            hint=q.hint,
            explanation=q.explanation,
        )
        for q in questions
    ]
    db.add_all(objs)
    db.commit()
    return db.query(Question).filter(Question.test_id == test_id).all()


def update(db: Session, *, question: Question, data: QuestionUpdate) -> Question:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    db.commit()
    db.refresh(question)
    return question


def delete(db: Session, *, question: Question) -> None:
    db.delete(question)
    db.commit()
