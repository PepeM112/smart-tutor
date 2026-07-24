"""Shared helpers for question content manipulation."""

from typing import TypedDict

from app.core.enums import QuestionGroupType, QuestionType
from app.models.question import Question
from app.models.test import Test
from app.schemas.question import (
    LongTextContentStripped,
    MultipleChoiceContent,
    MultipleChoiceContentStripped,
    QuestionReadStripped,
    SimpleContent,
    SimpleContentStripped,
    StrippedQuestionContent,
)
from app.schemas.test import TestReadStripped
from app.schemas.test_question_group import TestQuestionGroupReadStripped


def strip_question_answers(question: Question) -> StrippedQuestionContent:
    """Return question content with answer data removed.

    Strips ``answers`` from Simple questions, ``correct_indices`` from
    Multiple Choice questions, and ``rubric`` from Long Text questions
    so the client cannot see correct answers before submitting.
    """
    content: dict[str, object] = dict(question.content) if question.content else {}
    q_type = QuestionType(question.question_type)
    if q_type == QuestionType.SIMPLE:
        content.pop("answers", None)
        return SimpleContentStripped.model_validate(content)
    if q_type == QuestionType.MULTIPLE_CHOICE:
        content.pop("correct_indices", None)
        return MultipleChoiceContentStripped.model_validate(content)
    content.pop("rubric", None)
    return LongTextContentStripped.model_validate(content)


def build_stripped_question(question: Question) -> QuestionReadStripped:
    """Build a QuestionReadStripped from an ORM Question with answers removed."""
    return QuestionReadStripped(
        id=question.id,
        question_type=QuestionType(question.question_type),
        prompt=question.prompt,
        content=strip_question_answers(question),
        hint=question.hint,
        explanation=question.explanation,
        test_id=question.test_id,
        group_id=question.group_id,
        order=question.order,
        points=question.points,
    )


def build_stripped_test(test: Test) -> TestReadStripped:
    """Build a TestReadStripped from an ORM Test with answers removed from all questions."""
    return TestReadStripped(
        id=test.id,
        title=test.title,
        description=test.description,
        user_id=test.user_id,
        status=test.status,
        questions=[build_stripped_question(q) for q in test.questions],
        question_groups=[
            TestQuestionGroupReadStripped(
                id=g.id,
                test_id=g.test_id,
                type=QuestionGroupType(g.type),
                order=g.order,
                title=g.title,
                points=g.points,
                questions=[build_stripped_question(q) for q in g.questions],
            )
            for g in test.question_groups
        ],
    )


class CorrectAnswerFields(TypedDict, total=False):
    correct_answers: list[str]
    correct_indices: list[int]


def get_correct_answer_fields(question: Question) -> CorrectAnswerFields:
    """Extract correct-answer fields for the check response."""
    raw: dict[str, object] = question.content or {}
    q_type = QuestionType(question.question_type)
    if q_type == QuestionType.SIMPLE:
        parsed = SimpleContent.model_validate(raw)
        return CorrectAnswerFields(correct_answers=parsed.answers)
    if q_type == QuestionType.MULTIPLE_CHOICE:
        parsed_mc = MultipleChoiceContent.model_validate(raw)
        return CorrectAnswerFields(
            correct_answers=[parsed_mc.options[i] for i in parsed_mc.correct_indices if i < len(parsed_mc.options)],
            correct_indices=parsed_mc.correct_indices,
        )
    return CorrectAnswerFields()
