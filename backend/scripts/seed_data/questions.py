"""Seed standalone bank questions (no test)."""

from sqlalchemy.orm import Session

from app.core.enums import QuestionType
from app.models.question import Question


def seed_bank_questions(db: Session, user_id: str) -> list[Question]:
    questions = [
        Question(
            user_id=user_id,
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "good morning"',
            content={"answers": ["buenos días", "buenos dias"]},
            hint="A common morning greeting",
            explanation='"Buenos días" is the standard morning greeting in Spanish.',
        ),
        Question(
            user_id=user_id,
            question_type=QuestionType.SIMPLE,
            prompt='How do you say "please" in Spanish?',
            content={"answers": ["por favor"]},
            explanation='"Por favor" literally means "as a favour".',
        ),
        Question(
            user_id=user_id,
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which of these are months in Spanish?",
            content={
                "options": ["Enero", "Lunes", "Marzo", "Verano"],
                "correct_indices": [0, 2],
            },
            hint='"Lunes" is a day, "verano" is a season',
            explanation='"Enero" (January) and "marzo" (March) are months.',
        ),
        Question(
            user_id=user_id,
            question_type=QuestionType.SIMPLE,
            prompt="What is the chemical symbol for gold?",
            content={"answers": ["Au"]},
            explanation="From Latin 'aurum'.",
        ),
        Question(
            user_id=user_id,
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which planet is closest to the Sun?",
            content={
                "options": ["Venus", "Mercury", "Mars", "Earth"],
                "correct_indices": [1],
            },
            explanation="Mercury orbits at an average distance of 57.9 million km from the Sun.",
        ),
    ]
    db.add_all(questions)
    db.flush()
    return questions
