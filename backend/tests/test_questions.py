"""Tests for the Questions feature (ST-45).

Covers: schema validation, standalone question creation,
pagination schema, and assign-to-test service logic.

Run:  pytest tests/test_questions.py
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.enums import QuestionType
from app.schemas.pagination import PaginatedResponse
from app.schemas.question import (
    AssignQuestionRequest,
    BulkAssignQuestionsRequest,
    BulkDeleteQuestionsRequest,
    QuestionCreateStandalone,
    QuestionListRead,
    QuestionUpdate,
)

# ---------------------------------------------------------------------------
# QuestionCreateStandalone schema validation
# ---------------------------------------------------------------------------


class TestQuestionCreateStandaloneValidation:
    def test_simple_question_valid(self) -> None:
        q = QuestionCreateStandalone(
            question_type=QuestionType.SIMPLE,
            prompt="Translate: hello",
            content={"answers": ["hola"]},
        )
        assert q.question_type == QuestionType.SIMPLE
        assert q.prompt == "Translate: hello"

    def test_mc_question_valid(self) -> None:
        q = QuestionCreateStandalone(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which is correct?",
            content={"options": ["A", "B"], "correct_indices": [0]},
        )
        assert q.question_type == QuestionType.MULTIPLE_CHOICE

    def test_simple_requires_answers(self) -> None:
        with pytest.raises(ValidationError, match="answers"):
            QuestionCreateStandalone(
                question_type=QuestionType.SIMPLE,
                prompt="Test",
                content={"answers": []},
            )

    def test_mc_requires_at_least_two_options(self) -> None:
        with pytest.raises(ValidationError, match="options"):
            QuestionCreateStandalone(
                question_type=QuestionType.MULTIPLE_CHOICE,
                prompt="Test",
                content={"options": ["only one"], "correct_indices": [0]},
            )

    def test_mc_correct_index_out_of_range(self) -> None:
        with pytest.raises(ValidationError, match="correct_indices"):
            QuestionCreateStandalone(
                question_type=QuestionType.MULTIPLE_CHOICE,
                prompt="Test",
                content={"options": ["A", "B"], "correct_indices": [5]},
            )

    def test_prompt_required(self) -> None:
        with pytest.raises(ValidationError, match="prompt"):
            QuestionCreateStandalone(
                question_type=QuestionType.SIMPLE,
                content={"answers": ["hola"]},
            )

    def test_points_defaults_to_one(self) -> None:
        q = QuestionCreateStandalone(
            question_type=QuestionType.SIMPLE,
            prompt="Test",
            content={"answers": ["a"]},
        )
        assert q.points == 1.0


# ---------------------------------------------------------------------------
# QuestionUpdate schema validation
# ---------------------------------------------------------------------------


class TestQuestionUpdateValidation:
    def test_all_none_accepted(self) -> None:
        u = QuestionUpdate()
        assert u.prompt is None
        assert u.content is None
        assert u.question_type is None


# ---------------------------------------------------------------------------
# QuestionListRead schema
# ---------------------------------------------------------------------------


class TestQuestionListReadValidation:
    def test_bank_question_test_title_none(self) -> None:
        q = QuestionListRead(
            id="abc123",
            question_type=QuestionType.SIMPLE,
            prompt="Test prompt",
            content={"answers": ["a"]},
        )
        assert q.test_title is None
        assert q.test_id is None

    def test_camel_case_serialization(self) -> None:
        q = QuestionListRead(
            id="abc123",
            question_type=QuestionType.SIMPLE,
            prompt="Test",
            content={"answers": ["a"]},
            test_title="My Test",
        )
        dumped = q.model_dump(by_alias=True)
        assert "questionType" in dumped
        assert "testTitle" in dumped
        assert "test_title" not in dumped


# ---------------------------------------------------------------------------
# AssignQuestionRequest schema
# ---------------------------------------------------------------------------


class TestAssignQuestionRequestValidation:
    def test_test_id_required(self) -> None:
        with pytest.raises(ValidationError, match="testId"):
            AssignQuestionRequest()

    def test_camel_case_alias(self) -> None:
        r = AssignQuestionRequest(test_id="test_123")
        dumped = r.model_dump(by_alias=True)
        assert "testId" in dumped


# ---------------------------------------------------------------------------
# BulkDeleteQuestionsRequest / Response schemas
# ---------------------------------------------------------------------------


class TestBulkDeleteQuestionsRequestValidation:
    def test_empty_list_rejected(self) -> None:
        with pytest.raises(ValidationError, match="question_ids"):
            BulkDeleteQuestionsRequest(question_ids=[])

    def test_camel_case_alias(self) -> None:
        r = BulkDeleteQuestionsRequest(question_ids=["q1"])
        dumped = r.model_dump(by_alias=True)
        assert "questionIds" in dumped
        assert "question_ids" not in dumped


# ---------------------------------------------------------------------------
# BulkAssignQuestionsRequest / Response schemas
# ---------------------------------------------------------------------------


class TestBulkAssignQuestionsRequestValidation:
    def test_empty_list_rejected(self) -> None:
        with pytest.raises(ValidationError, match="question_ids"):
            BulkAssignQuestionsRequest(question_ids=[], test_id="test_123")

    def test_test_id_required(self) -> None:
        with pytest.raises(ValidationError, match="testId"):
            BulkAssignQuestionsRequest(question_ids=["q1"])

    def test_camel_case_alias(self) -> None:
        r = BulkAssignQuestionsRequest(question_ids=["q1"], test_id="test_123")
        dumped = r.model_dump(by_alias=True)
        assert "questionIds" in dumped
        assert "testId" in dumped


# ---------------------------------------------------------------------------
# PaginatedResponse schema
# ---------------------------------------------------------------------------


class TestPaginatedResponseValidation:
    def test_camel_case_serialization(self) -> None:
        paginated = PaginatedResponse[QuestionListRead](
            items=[],
            total=0,
            page=1,
            per_page=20,
        )
        dumped = paginated.model_dump(by_alias=True)
        assert "perPage" in dumped
        assert "per_page" not in dumped
