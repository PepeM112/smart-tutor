"""Shared helpers for question content manipulation."""

from app.core.enums import QuestionGroupType, QuestionType
from app.models.question import Question
from app.models.test import Test
from app.schemas.question import QuestionReadStripped
from app.schemas.test import TestReadStripped
from app.schemas.test_question_group import TestQuestionGroupReadStripped


def strip_question_answers(question: Question) -> dict:
    """Return a copy of question content with answer data removed.

    Strips ``answers`` from Simple questions and ``correct_indices`` from
    Multiple Choice questions so the client cannot see correct answers
    before submitting.
    """
    content = dict(question.content) if question.content else {}
    q_type = QuestionType(question.question_type)
    if q_type == QuestionType.SIMPLE:
        content.pop("answers", None)
    elif q_type == QuestionType.MULTIPLE_CHOICE:
        content.pop("correct_indices", None)
    return content


def build_stripped_question(question: Question) -> QuestionReadStripped:
    """Build a QuestionReadStripped from an ORM Question with answers removed."""
    return QuestionReadStripped(
        id=question.id,
        question_type=question.question_type,
        prompt=question.prompt,
        content=strip_question_answers(question),
        hint=question.hint,
        explanation=question.explanation,
        test_id=question.test_id,
        group_id=question.group_id,
        order=question.order,
    )


def build_stripped_test(test: Test) -> TestReadStripped:
    """Build a TestReadStripped from an ORM Test with answers removed from all questions."""
    return TestReadStripped(
        id=test.id,
        title=test.title,
        description=test.description,
        user_id=test.user_id,
        questions=[build_stripped_question(q) for q in test.questions],
        question_groups=[
            TestQuestionGroupReadStripped(
                id=g.id,
                test_id=g.test_id,
                type=QuestionGroupType(g.type),
                order=g.order,
                title=g.title,
                questions=[build_stripped_question(q) for q in g.questions],
            )
            for g in test.question_groups
        ],
    )


def get_correct_answer_fields(question: Question) -> dict:
    """Extract correct-answer fields for the check response.

    Returns a dict with ``correct_answers`` (for Simple) and/or
    ``correct_indices`` (for MC), ready to unpack into
    ``QuestionCheckResponse``.
    """
    content = question.content or {}
    q_type = QuestionType(question.question_type)
    if q_type == QuestionType.SIMPLE:
        return {"correct_answers": content.get("answers", [])}
    if q_type == QuestionType.MULTIPLE_CHOICE:
        options = content.get("options", [])
        indices = content.get("correct_indices", [])
        return {
            "correct_answers": [options[i] for i in indices if i < len(options)],
            "correct_indices": indices,
        }
    return {}
