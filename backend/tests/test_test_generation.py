"""Unit tests for test_generation_service (no DB, no LLM)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.enums import QuestionType
from app.services.llm import CompletionResult
from app.services.test_generation_service import _call_and_validate


def _completion(text: str) -> CompletionResult:
    return CompletionResult(
        text=text, input_tokens=10, output_tokens=20, provider="anthropic", model="test", truncated=False
    )


class TestUsageRecording:
    def test_usage_is_committed_when_both_attempts_fail(self) -> None:
        # The 422 (or the rollback of a failed AI tool) must not drop the usage rows of the paid LLM calls.
        db = MagicMock()

        with (
            patch("app.services.test_generation_service.complete_for_user", return_value=_completion("not json")),
            patch("app.services.test_generation_service.token_usage_service") as mock_usage,
            pytest.raises(HTTPException) as exc,
        ):
            _call_and_validate(db, user=MagicMock(), user_prompt="p", requested_types={QuestionType.SIMPLE})

        assert exc.value.status_code == 422
        assert mock_usage.record_usage.call_count == 2
        assert db.commit.call_count == 2
