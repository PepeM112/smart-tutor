"""Simulate a test edit after results exist to exercise copy-on-write versioning.

After this runs, the Spanish Vocabulary test's result points to a frozen version
with the original content, while the canonical test shows the edited state.
"""

from sqlalchemy.orm import Session

from app.core.enums import QuestionStatus, QuestionType
from app.models.question import Question
from app.models.test import Test
from app.services.versioning_service import version_test_if_needed


def seed_versioned_edit(db: Session, test: Test) -> None:
    """Clone the test into a frozen version, then mutate the canonical."""
    version_test_if_needed(db, test=test)

    test.title = "Spanish Vocabulary (Updated)"
    test.description = "Basic Spanish words — revised edition with new questions"

    for q in test.questions:
        if "hello" in q.prompt.lower():
            q.prompt = 'How do you say "hi" in Spanish?'
            break

    for q in test.questions:
        if "water" in q.prompt.lower():
            q.status = int(QuestionStatus.DELETED)
            break

    new_q = Question(
        question_type=int(QuestionType.SIMPLE),
        prompt='Translate: "dog"',
        content={"answers": ["perro"]},
        test_id=test.id,
        order=7,
        points=1.0,
    )
    db.add(new_q)
    db.flush()
