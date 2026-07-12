"""Tests for the question stripping helpers used by GET /tests/{id}/exam."""

from __future__ import annotations

from unittest.mock import MagicMock

from app.core.enums import QuestionGroupType, QuestionType, TestStatus
from app.schemas.question import (
    LongTextContentStripped,
    MultipleChoiceContentStripped,
    SimpleContentStripped,
)
from app.schemas.test import TestReadStripped
from app.services.question_helpers import build_stripped_test, strip_question_answers


def _make_question(
    q_type: QuestionType,
    content: dict,
    *,
    id: str = "q1",
    prompt: str = "Test?",
    hint: str | None = None,
    explanation: str | None = None,
    test_id: str | None = "t1",
    group_id: str | None = None,
    order: int = 0,
    points: float = 1.0,
) -> MagicMock:
    q = MagicMock()
    q.id = id
    q.question_type = int(q_type)
    q.prompt = prompt
    q.content = content
    q.hint = hint
    q.explanation = explanation
    q.test_id = test_id
    q.group_id = group_id
    q.order = order
    q.points = points
    return q


def _make_test(
    questions: list | None = None,
    question_groups: list | None = None,
) -> MagicMock:
    t = MagicMock()
    t.id = "t1"
    t.title = "My Test"
    t.description = "A test"
    t.user_id = "u1"
    t.status = TestStatus.ACTIVE
    t.questions = questions or []
    t.question_groups = question_groups or []
    return t


def _make_group(
    questions: list,
    *,
    id: str = "g1",
    test_id: str = "t1",
    group_type: QuestionGroupType = QuestionGroupType.VOCABULARY,
    order: int = 0,
    title: str = "Group",
) -> MagicMock:
    g = MagicMock()
    g.id = id
    g.test_id = test_id
    g.type = int(group_type)
    g.order = order
    g.title = title
    g.questions = questions
    return g


# ---------------------------------------------------------------------------
# strip_question_answers
# ---------------------------------------------------------------------------


class TestStripQuestionAnswers:
    def test_simple_removes_answers(self) -> None:
        q = _make_question(QuestionType.SIMPLE, {"answers": ["ir", "marchar"]})
        result = strip_question_answers(q)

        assert isinstance(result, SimpleContentStripped)
        assert result.answers is None

    def test_mc_removes_correct_indices_keeps_options(self) -> None:
        q = _make_question(
            QuestionType.MULTIPLE_CHOICE,
            {"options": ["A", "B", "C"], "correct_indices": [0, 2]},
        )
        result = strip_question_answers(q)

        assert isinstance(result, MultipleChoiceContentStripped)
        assert result.options == ["A", "B", "C"]
        assert result.correct_indices is None

    def test_long_text_removes_rubric_keeps_length_limit(self) -> None:
        q = _make_question(
            QuestionType.LONG_TEXT,
            {"length_limit": 1, "rubric": [{"point": "Mentions X", "weight": 1.0}]},
        )
        result = strip_question_answers(q)

        assert isinstance(result, LongTextContentStripped)
        assert result.length_limit == 1
        assert result.rubric is None

    def test_simple_with_empty_content(self) -> None:
        q = _make_question(QuestionType.SIMPLE, {})
        result = strip_question_answers(q)

        assert isinstance(result, SimpleContentStripped)
        assert result.answers is None


# ---------------------------------------------------------------------------
# build_stripped_test
# ---------------------------------------------------------------------------


class TestBuildStrippedTest:
    def test_strips_standalone_questions(self) -> None:
        questions = [
            _make_question(QuestionType.SIMPLE, {"answers": ["yes"]}, id="q1", order=0),
            _make_question(
                QuestionType.MULTIPLE_CHOICE,
                {"options": ["A", "B"], "correct_indices": [1]},
                id="q2",
                order=1,
            ),
        ]
        test = _make_test(questions=questions)

        result = build_stripped_test(test)

        assert isinstance(result, TestReadStripped)
        assert len(result.questions) == 2
        assert isinstance(result.questions[0].content, SimpleContentStripped)
        assert isinstance(result.questions[1].content, MultipleChoiceContentStripped)
        assert result.questions[1].content.correct_indices is None

    def test_strips_grouped_questions(self) -> None:
        group_questions = [
            _make_question(QuestionType.SIMPLE, {"answers": ["a"]}, id="gq1", group_id="g1"),
            _make_question(QuestionType.SIMPLE, {"answers": ["b"]}, id="gq2", group_id="g1"),
        ]
        group = _make_group(group_questions)
        test = _make_test(question_groups=[group])

        result = build_stripped_test(test)

        assert len(result.question_groups) == 1
        assert len(result.question_groups[0].questions) == 2
        assert result.question_groups[0].questions[0].content.answers is None

    def test_preserves_metadata(self) -> None:
        q = _make_question(
            QuestionType.SIMPLE,
            {"answers": ["x"]},
            hint="Think about it",
            explanation="Because reasons",
            order=3,
        )
        test = _make_test(questions=[q])

        result = build_stripped_test(test)

        sq = result.questions[0]
        assert sq.hint == "Think about it"
        assert sq.explanation == "Because reasons"
        assert sq.order == 3
        assert result.title == "My Test"
        assert result.description == "A test"

    def test_empty_test(self) -> None:
        test = _make_test()
        result = build_stripped_test(test)

        assert result.questions == []
        assert result.question_groups == []
        assert result.id == "t1"
