"""Tests for the AI grading pipeline.

Covers: prompt construction, response parsing, rubric scoring, and status determination.
Unit tests mock all SDK calls. Integration tests (marked `integration`) hit the real API.

Run unit tests only:  pytest tests/test_grading.py
Run integration too:  pytest tests/test_grading.py -m integration
Run everything:       pytest tests/test_grading.py --run-integration
"""

from __future__ import annotations

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from app.core.enums import AnswerStatus, LongTextLength
from app.schemas.question import LongTextContent, RubricItem
from app.services.grading.anthropic_provider import AnthropicGradingProvider
from app.services.grading.base import CriterionResult
from app.services.grading.openai_provider import OpenAIGradingProvider
from app.services.grading.prompt import SYSTEM_PROMPT, build_user_prompt, strip_code_fences
from app.services.grading_service import (
    _build_rubric_result,
    _determine_status,
    _score_from_rubric_result,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


SAMPLE_RUBRIC = [
    RubricItem(point="Mentions the Rubicon crossing", weight=0.30),
    RubricItem(point="Names the Battle of Pharsalus", weight=0.30),
    RubricItem(point="Explains Octavian becoming Augustus", weight=0.40),
]

SAMPLE_CONTENT = LongTextContent(
    length_limit=LongTextLength.MEDIUM,
    rubric=SAMPLE_RUBRIC,
)


def _make_ai_response(results: list[dict]) -> str:
    return json.dumps({"results": results})


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------


class TestBuildUserPrompt:
    def test_includes_question_rubric_and_answer(self) -> None:
        prompt = build_user_prompt("What happened?", SAMPLE_RUBRIC, "Caesar crossed the Rubicon.")
        assert "## Question" in prompt
        assert "What happened?" in prompt
        assert "## Rubric" in prompt
        assert "## Student Answer" in prompt
        assert "Caesar crossed the Rubicon." in prompt

    def test_rubric_is_valid_json(self) -> None:
        prompt = build_user_prompt("Q", SAMPLE_RUBRIC, "A")
        rubric_section = prompt.split("## Rubric\n")[1].split("\n\n## Student Answer")[0]
        parsed = json.loads(rubric_section)
        assert len(parsed) == 3
        assert parsed[0]["index"] == 0
        assert parsed[0]["point"] == "Mentions the Rubicon crossing"

    def test_system_prompt_requests_json_format(self) -> None:
        assert "JSON" in SYSTEM_PROMPT
        assert "reason" in SYSTEM_PROMPT
        assert "met" in SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Code fence stripping
# ---------------------------------------------------------------------------


class TestStripCodeFences:
    def test_strips_json_fence(self) -> None:
        raw = '```json\n{"results": [{"index": 0, "met": true}]}\n```'
        assert strip_code_fences(raw) == '{"results": [{"index": 0, "met": true}]}'

    def test_strips_plain_fence(self) -> None:
        raw = '```\n{"results": []}\n```'
        assert strip_code_fences(raw) == '{"results": []}'

    def test_passes_through_raw_json(self) -> None:
        raw = '{"results": [{"index": 0, "met": true}]}'
        assert strip_code_fences(raw) == raw

    def test_strips_surrounding_whitespace(self) -> None:
        raw = '  \n {"results": []}  \n '
        assert strip_code_fences(raw) == '{"results": []}'


# ---------------------------------------------------------------------------
# Status determination
# ---------------------------------------------------------------------------


class TestDetermineStatus:
    def test_all_met_is_correct(self) -> None:
        results = [CriterionResult(index=i, met=True) for i in range(3)]
        assert _determine_status(results, 3) == AnswerStatus.CORRECT

    def test_none_met_is_wrong(self) -> None:
        results = [CriterionResult(index=i, met=False) for i in range(3)]
        assert _determine_status(results, 3) == AnswerStatus.WRONG

    def test_some_met_is_partial(self) -> None:
        results = [
            CriterionResult(index=0, met=True),
            CriterionResult(index=1, met=False),
            CriterionResult(index=2, met=True),
        ]
        assert _determine_status(results, 3) == AnswerStatus.PARTIAL

    def test_single_criterion_met(self) -> None:
        assert _determine_status([CriterionResult(index=0, met=True)], 1) == AnswerStatus.CORRECT

    def test_single_criterion_not_met(self) -> None:
        assert _determine_status([CriterionResult(index=0, met=False)], 1) == AnswerStatus.WRONG


# ---------------------------------------------------------------------------
# Rubric result building
# ---------------------------------------------------------------------------


class TestBuildRubricResult:
    def test_maps_results_to_criteria(self) -> None:
        results = [
            CriterionResult(index=0, met=True, reason="Mentioned it"),
            CriterionResult(index=1, met=False, reason="Not mentioned"),
            CriterionResult(index=2, met=True, reason="Good explanation"),
        ]
        rubric_result = _build_rubric_result(SAMPLE_CONTENT, results)

        assert len(rubric_result) == 3
        assert rubric_result[0]["met"] is True
        assert rubric_result[0]["weight"] == 0.30
        assert rubric_result[0]["point"] == "Mentions the Rubicon crossing"
        assert rubric_result[0]["reason"] == "Mentioned it"

        assert rubric_result[1]["met"] is False
        assert rubric_result[1]["reason"] == "Not mentioned"

    def test_missing_result_defaults_to_not_met(self) -> None:
        results = [CriterionResult(index=0, met=True)]
        rubric_result = _build_rubric_result(SAMPLE_CONTENT, results)

        assert rubric_result[1]["met"] is False
        assert rubric_result[1]["reason"] == ""
        assert rubric_result[2]["met"] is False

    def test_reason_defaults_to_empty_string(self) -> None:
        results = [CriterionResult(index=0, met=True)]
        rubric_result = _build_rubric_result(SAMPLE_CONTENT, results)
        assert rubric_result[0]["reason"] == ""


# ---------------------------------------------------------------------------
# Score calculation
# ---------------------------------------------------------------------------


class TestScoreFromRubricResult:
    def test_all_met_gives_full_points(self) -> None:
        rubric_result = [
            {"point": "A", "met": True, "weight": 0.30, "reason": ""},
            {"point": "B", "met": True, "weight": 0.30, "reason": ""},
            {"point": "C", "met": True, "weight": 0.40, "reason": ""},
        ]
        score = _score_from_rubric_result(SAMPLE_CONTENT, rubric_result, question_points=2.0)
        assert score == pytest.approx(2.0)

    def test_none_met_gives_zero(self) -> None:
        rubric_result = [
            {"point": "A", "met": False, "weight": 0.30, "reason": ""},
            {"point": "B", "met": False, "weight": 0.30, "reason": ""},
            {"point": "C", "met": False, "weight": 0.40, "reason": ""},
        ]
        score = _score_from_rubric_result(SAMPLE_CONTENT, rubric_result, question_points=2.0)
        assert score == pytest.approx(0.0)

    def test_partial_met_scales_proportionally(self) -> None:
        rubric_result = [
            {"point": "A", "met": True, "weight": 0.30, "reason": ""},
            {"point": "B", "met": False, "weight": 0.30, "reason": ""},
            {"point": "C", "met": True, "weight": 0.40, "reason": ""},
        ]
        # earned_weight = 0.30 + 0.40 = 0.70, total_weight = 1.00
        score = _score_from_rubric_result(SAMPLE_CONTENT, rubric_result, question_points=1.0)
        assert score == pytest.approx(0.70)

    def test_zero_weight_rubric_is_rejected_by_validator(self) -> None:
        with pytest.raises(ValueError, match="greater than 0"):
            LongTextContent(
                length_limit=LongTextLength.SHORT,
                rubric=[RubricItem(point="A", weight=0.0)],
            )


# ---------------------------------------------------------------------------
# Anthropic provider — response parsing
# ---------------------------------------------------------------------------


class TestAnthropicProvider:
    def _make_provider(self) -> AnthropicGradingProvider:
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-ant-test-key"}):
            return AnthropicGradingProvider()

    def _mock_response(self, text: str) -> MagicMock:
        from anthropic.types import TextBlock

        block = TextBlock(type="text", text=text)
        response = MagicMock()
        response.content = [block]
        return response

    def test_parses_valid_response(self) -> None:
        provider = self._make_provider()
        ai_json = _make_ai_response(
            [
                {"index": 0, "met": True, "reason": "Student mentioned it"},
                {"index": 1, "met": False, "reason": "Not covered"},
                {"index": 2, "met": True, "reason": "Well explained"},
            ]
        )
        provider._client = MagicMock()
        provider._client.messages.create.return_value = self._mock_response(ai_json)

        results = provider.grade("Question?", SAMPLE_RUBRIC, "Some answer")

        assert len(results) == 3
        assert results[0].met is True
        assert results[0].reason == "Student mentioned it"
        assert results[1].met is False
        assert results[2].index == 2

    def test_parses_code_fenced_response(self) -> None:
        provider = self._make_provider()
        ai_json = (
            "```json\n"
            + _make_ai_response(
                [
                    {"index": 0, "met": True, "reason": "Good"},
                ]
            )
            + "\n```"
        )
        provider._client = MagicMock()
        provider._client.messages.create.return_value = self._mock_response(ai_json)

        results = provider.grade("Q?", SAMPLE_RUBRIC[:1], "A")
        assert len(results) == 1
        assert results[0].met is True

    def test_raises_on_empty_response(self) -> None:
        provider = self._make_provider()
        provider._client = MagicMock()
        provider._client.messages.create.return_value = self._mock_response("")

        with pytest.raises(ValueError, match="empty text"):
            provider.grade("Question?", SAMPLE_RUBRIC, "Some answer")

    def test_raises_on_missing_results_key(self) -> None:
        provider = self._make_provider()
        provider._client = MagicMock()
        provider._client.messages.create.return_value = self._mock_response('{"data": []}')

        with pytest.raises(KeyError):
            provider.grade("Question?", SAMPLE_RUBRIC, "Some answer")

    def test_handles_response_without_reason_field(self) -> None:
        provider = self._make_provider()
        ai_json = _make_ai_response(
            [
                {"index": 0, "met": True},
                {"index": 1, "met": False},
            ]
        )
        provider._client = MagicMock()
        provider._client.messages.create.return_value = self._mock_response(ai_json)

        results = provider.grade("Q?", SAMPLE_RUBRIC[:2], "A")
        assert results[0].reason == ""
        assert results[1].reason == ""

    def test_raises_without_api_key(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            from app.services.grading.anthropic_provider import AnthropicGradingProvider

            with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
                AnthropicGradingProvider()


# ---------------------------------------------------------------------------
# OpenAI provider — response parsing
# ---------------------------------------------------------------------------


class TestOpenAIProvider:
    def _make_provider(self) -> OpenAIGradingProvider:
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test-key"}):
            return OpenAIGradingProvider()

    def _mock_response(self, text: str) -> MagicMock:
        choice = MagicMock()
        choice.message.content = text
        response = MagicMock()
        response.choices = [choice]
        return response

    def test_parses_valid_response(self) -> None:
        provider = self._make_provider()
        ai_json = _make_ai_response(
            [
                {"index": 0, "met": True, "reason": "Covered"},
                {"index": 1, "met": False, "reason": "Missing"},
            ]
        )
        provider._client = MagicMock()
        provider._client.chat.completions.create.return_value = self._mock_response(ai_json)

        results = provider.grade("Q?", SAMPLE_RUBRIC[:2], "Answer")

        assert len(results) == 2
        assert results[0].met is True
        assert results[0].reason == "Covered"

    def test_empty_content_falls_back_to_empty_results(self) -> None:
        provider = self._make_provider()
        provider._client = MagicMock()
        provider._client.chat.completions.create.return_value = self._mock_response("")

        results = provider.grade("Q?", SAMPLE_RUBRIC[:1], "Answer")
        assert results == []

    def test_raises_without_api_key(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            from app.services.grading.openai_provider import OpenAIGradingProvider

            with pytest.raises(ValueError, match="OPENAI_API_KEY"):
                OpenAIGradingProvider()


# ---------------------------------------------------------------------------
# Integration tests — real API calls (run with: pytest -m integration)
# ---------------------------------------------------------------------------

_INTEGRATION_RUBRIC = [
    RubricItem(point="Names Paris as the capital of France", weight=0.50),
    RubricItem(point="Mentions the Eiffel Tower as a landmark", weight=0.50),
]

_GOOD_ANSWER = "The capital of France is Paris, famous for the Eiffel Tower."
_BAD_ANSWER = "I don't know anything about France."


@pytest.mark.integration
class TestAnthropicIntegration:
    """Real API calls to Anthropic. Requires ANTHROPIC_API_KEY in env."""

    @pytest.fixture(autouse=True)
    def _require_api_key(self) -> None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            pytest.skip("ANTHROPIC_API_KEY not set")

    def _make_provider(self) -> AnthropicGradingProvider:
        return AnthropicGradingProvider()

    def test_grades_correct_answer(self) -> None:
        provider = self._make_provider()
        results = provider.grade(
            "What is the capital of France and name a famous landmark there.",
            _INTEGRATION_RUBRIC,
            _GOOD_ANSWER,
        )

        assert len(results) == 2
        assert all(isinstance(r, CriterionResult) for r in results)
        assert results[0].met is True
        assert results[1].met is True
        assert results[0].reason != ""

    def test_grades_wrong_answer(self) -> None:
        provider = self._make_provider()
        results = provider.grade(
            "What is the capital of France and name a famous landmark there.",
            _INTEGRATION_RUBRIC,
            _BAD_ANSWER,
        )

        assert len(results) == 2
        assert results[0].met is False
        assert results[1].met is False

    def test_full_pipeline_scoring(self) -> None:
        """End-to-end: grade -> build rubric result -> calculate score."""
        provider = self._make_provider()
        content = LongTextContent(length_limit=LongTextLength.SHORT, rubric=_INTEGRATION_RUBRIC)

        results = provider.grade(
            "What is the capital of France and name a famous landmark there.",
            _INTEGRATION_RUBRIC,
            _GOOD_ANSWER,
        )

        status = _determine_status(results, len(_INTEGRATION_RUBRIC))
        rubric_result = _build_rubric_result(content, results)
        score = _score_from_rubric_result(content, rubric_result, question_points=1.0)

        assert status == AnswerStatus.CORRECT
        assert score == pytest.approx(1.0)
        assert all(item["reason"] != "" for item in rubric_result)


@pytest.mark.integration
class TestOpenAIIntegration:
    """Real API calls to OpenAI. Requires OPENAI_API_KEY in env."""

    @pytest.fixture(autouse=True)
    def _require_api_key(self) -> None:
        if not os.getenv("OPENAI_API_KEY"):
            pytest.skip("OPENAI_API_KEY not set")

    def _make_provider(self) -> OpenAIGradingProvider:
        return OpenAIGradingProvider()

    def test_grades_correct_answer(self) -> None:
        provider = self._make_provider()
        results = provider.grade(
            "What is the capital of France and name a famous landmark there.",
            _INTEGRATION_RUBRIC,
            _GOOD_ANSWER,
        )

        assert len(results) == 2
        assert results[0].met is True
        assert results[1].met is True
        assert results[0].reason != ""
