"""Tests for the Notes feature.

Covers: schema validation (P0-1), AI generation error handling (P0-2),
prompt construction, and LLM client response parsing.

Run:  pytest tests/test_notes.py
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from app.core.enums import NoteLength, NoteSource
from app.schemas.note import NoteBase, NoteCreate, NoteGenerate, NoteUpdate
from app.services.llm import AnthropicLLMClient, CompletionResult, OpenAILLMClient
from app.services.note_prompts import NOTE_GENERATION_SYSTEM_PROMPT, build_note_generation_user_prompt

# ---------------------------------------------------------------------------
# Schema validation (P0-1: max_length enforcement)
# ---------------------------------------------------------------------------


class TestNoteSchemaValidation:
    def test_title_at_max_length_accepted(self) -> None:
        note = NoteBase(title="x" * 200)
        assert len(note.title) == 200

    def test_title_exceeding_max_length_rejected(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteBase(title="x" * 201)

    def test_description_at_max_length_accepted(self) -> None:
        note = NoteBase(title="valid", description="d" * 500)
        assert note.description is not None and len(note.description) == 500

    def test_description_exceeding_max_length_rejected(self) -> None:
        with pytest.raises(ValidationError, match="at most 500"):
            NoteBase(title="valid", description="d" * 501)

    def test_description_none_accepted(self) -> None:
        note = NoteBase(title="valid")
        assert note.description is None

    def test_create_inherits_validation(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteCreate(title="x" * 201)

    def test_update_title_max_length(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteUpdate(title="x" * 201)

    def test_update_description_max_length(self) -> None:
        with pytest.raises(ValidationError, match="at most 500"):
            NoteUpdate(description="d" * 501)

    def test_update_all_none_accepted(self) -> None:
        update = NoteUpdate()
        assert update.title is None
        assert update.description is None
        assert update.content is None
        assert update.tags is None

    def test_generate_topic_max_length(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteGenerate(topic="t" * 201)

    def test_generate_topic_at_max_length_accepted(self) -> None:
        gen = NoteGenerate(topic="t" * 200)
        assert len(gen.topic) == 200


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------


class TestNotePromptConstruction:
    def test_includes_topic(self) -> None:
        prompt = build_note_generation_user_prompt("Spanish verbs")
        assert "## Topic" in prompt
        assert "Spanish verbs" in prompt

    def test_includes_guidance_when_provided(self) -> None:
        prompt = build_note_generation_user_prompt("Spanish verbs", guidance="Focus on irregular verbs")
        assert "## Additional Guidance" in prompt
        assert "Focus on irregular verbs" in prompt

    def test_excludes_guidance_when_none(self) -> None:
        prompt = build_note_generation_user_prompt("Spanish verbs")
        assert "## Additional Guidance" not in prompt

    def test_includes_length_hint(self) -> None:
        prompt = build_note_generation_user_prompt("Topic", length=NoteLength.SHORT)
        assert "## Length" in prompt
        assert "300-500 words" in prompt

    def test_medium_length_hint(self) -> None:
        prompt = build_note_generation_user_prompt("Topic", length=NoteLength.MEDIUM)
        assert "800-1500 words" in prompt

    def test_long_length_hint(self) -> None:
        prompt = build_note_generation_user_prompt("Topic", length=NoteLength.LONG)
        assert "2000-3500 words" in prompt

    def test_system_prompt_requests_markdown(self) -> None:
        assert "Markdown" in NOTE_GENERATION_SYSTEM_PROMPT
        assert "headings" in NOTE_GENERATION_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Anthropic LLM client
# ---------------------------------------------------------------------------


class TestAnthropicLLMClient:
    def _make_client(self) -> AnthropicLLMClient:
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-ant-test-key"}):
            return AnthropicLLMClient()

    def _mock_response(self, text: str) -> MagicMock:
        from anthropic.types import TextBlock

        block = TextBlock(type="text", text=text)
        response = MagicMock()
        response.content = [block]
        response.usage.input_tokens = 10
        response.usage.output_tokens = 20
        return response

    def test_returns_text(self) -> None:
        client = self._make_client()
        markdown = "## Spanish Verbs\n\n- **ser** — to be\n- **ir** — to go"
        client._client = MagicMock()
        client._client.messages.create.return_value = self._mock_response(markdown)

        result = client.complete(system="You are helpful.", user_prompt="Write notes", max_tokens=4096)
        assert "Spanish Verbs" in result.text
        assert "**ser**" in result.text
        assert result.input_tokens == 10
        assert result.output_tokens == 20

    def test_strips_whitespace_from_response(self) -> None:
        client = self._make_client()
        client._client = MagicMock()
        client._client.messages.create.return_value = self._mock_response("  \n## Notes\ncontent\n  ")

        result = client.complete(system="sys", user_prompt="usr", max_tokens=4096)
        assert result.text.startswith("## Notes")
        assert result.text.endswith("content")

    def test_raises_on_empty_response(self) -> None:
        client = self._make_client()
        response = MagicMock()
        response.content = []
        client._client = MagicMock()
        client._client.messages.create.return_value = response

        with pytest.raises(ValueError, match="Empty response"):
            client.complete(system="sys", user_prompt="usr", max_tokens=4096)

    def test_raises_on_empty_text(self) -> None:
        client = self._make_client()
        client._client = MagicMock()
        client._client.messages.create.return_value = self._mock_response("   ")

        with pytest.raises(ValueError, match="empty text"):
            client.complete(system="sys", user_prompt="usr", max_tokens=4096)

    def test_raises_on_non_text_block(self) -> None:
        client = self._make_client()
        block = MagicMock()
        type(block).__name__ = "ToolUseBlock"
        response = MagicMock()
        response.content = [block]
        client._client = MagicMock()
        client._client.messages.create.return_value = response

        with pytest.raises(TypeError, match="Expected TextBlock"):
            client.complete(system="sys", user_prompt="usr", max_tokens=4096)

    def test_raises_without_api_key(self) -> None:
        with patch.dict("os.environ", {}, clear=True), pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            AnthropicLLMClient()


# ---------------------------------------------------------------------------
# OpenAI LLM client
# ---------------------------------------------------------------------------


class TestOpenAILLMClient:
    def _make_client(self) -> OpenAILLMClient:
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test-key"}):
            return OpenAILLMClient()

    def _mock_response(self, text: str) -> MagicMock:
        choice = MagicMock()
        choice.message.content = text
        response = MagicMock()
        response.choices = [choice]
        response.usage.prompt_tokens = 15
        response.usage.completion_tokens = 25
        return response

    def test_returns_text(self) -> None:
        client = self._make_client()
        markdown = "## Geography\n\n- France: Paris"
        client._client = MagicMock()
        client._client.chat.completions.create.return_value = self._mock_response(markdown)

        result = client.complete(system="You are helpful.", user_prompt="Write notes", max_tokens=4096)
        assert "Geography" in result.text
        assert result.input_tokens == 15
        assert result.output_tokens == 25

    def test_raises_on_empty_text(self) -> None:
        client = self._make_client()
        client._client = MagicMock()
        client._client.chat.completions.create.return_value = self._mock_response("")

        with pytest.raises(ValueError, match="empty text"):
            client.complete(system="sys", user_prompt="usr", max_tokens=4096)

    def test_raises_without_api_key(self) -> None:
        with patch.dict("os.environ", {}, clear=True), pytest.raises(ValueError, match="OPENAI_API_KEY"):
            OpenAILLMClient()


# ---------------------------------------------------------------------------
# Service-level error handling (P0-2)
# ---------------------------------------------------------------------------


class TestNoteServiceErrorHandling:
    """Tests that generate_note maps provider errors to proper HTTPExceptions."""

    def _make_user(self) -> MagicMock:
        user = MagicMock()
        user.id = "user-123"
        return user

    def _mock_completion(self, text: str) -> CompletionResult:
        return CompletionResult(text=text, input_tokens=10, output_tokens=20, provider="anthropic", model="test")

    def test_missing_api_key_returns_403(self) -> None:
        from fastapi import HTTPException

        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="test topic")

        with patch(
            "app.services.note_service.complete_for_user",
            side_effect=HTTPException(
                status_code=403, detail="AI is not configured. Please add your API key in Settings."
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                generate_note(db, current_user=self._make_user(), data=data)
            assert exc_info.value.status_code == 403
            assert "not configured" in exc_info.value.detail

    def test_provider_value_error_returns_502(self) -> None:
        from fastapi import HTTPException

        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="test topic")

        with patch(
            "app.services.note_service.complete_for_user",
            side_effect=HTTPException(
                status_code=502, detail="AI service returned an invalid response. Please try again."
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                generate_note(db, current_user=self._make_user(), data=data)
            assert exc_info.value.status_code == 502
            assert "invalid response" in exc_info.value.detail

    def test_provider_type_error_returns_502(self) -> None:
        from fastapi import HTTPException

        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="test topic")

        with patch(
            "app.services.note_service.complete_for_user",
            side_effect=HTTPException(
                status_code=502, detail="AI service returned an invalid response. Please try again."
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                generate_note(db, current_user=self._make_user(), data=data)
            assert exc_info.value.status_code == 502

    def test_unexpected_error_returns_502(self) -> None:
        from fastapi import HTTPException

        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="test topic")

        with patch(
            "app.services.note_service.complete_for_user",
            side_effect=HTTPException(
                status_code=502, detail="AI service encountered an error. Please try again later."
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                generate_note(db, current_user=self._make_user(), data=data)
            assert exc_info.value.status_code == 502
            assert "try again" in exc_info.value.detail.lower()

    def test_successful_generation(self) -> None:
        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="Spanish verbs")
        mock_note = MagicMock()
        mock_note.id = "note-456"

        with (
            patch(
                "app.services.note_service.complete_for_user",
                return_value=self._mock_completion("## Spanish Verbs\n\nContent here"),
            ),
            patch("app.services.note_service.token_usage_service"),
            patch("app.services.note_service.note_crud") as mock_crud,
        ):
            mock_crud.create.return_value = mock_note
            result = generate_note(db, current_user=self._make_user(), data=data)

            mock_crud.create.assert_called_once()
            call_kwargs = mock_crud.create.call_args.kwargs
            assert call_kwargs["source"] == NoteSource.AI_GENERATED
            assert call_kwargs["title"] == "Spanish verbs"
            assert "## Spanish Verbs" in call_kwargs["content"]
            db.commit.assert_called_once()
            db.refresh.assert_called_once_with(mock_note)
            assert result == mock_note


# ---------------------------------------------------------------------------
# Integration tests — real API calls (run with: pytest -m integration)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestAnthropicNoteIntegration:
    """Real API calls to Anthropic for note generation."""

    @pytest.fixture(autouse=True)
    def _require_api_key(self) -> None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            pytest.skip("ANTHROPIC_API_KEY not set")

    def _make_client(self) -> AnthropicLLMClient:
        return AnthropicLLMClient()

    def test_generates_markdown_notes(self) -> None:
        client = self._make_client()
        user_prompt = build_note_generation_user_prompt("The water cycle", length=NoteLength.SHORT)
        result = client.complete(
            system=NOTE_GENERATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=4096,
        )

        assert len(result.text) > 100
        assert "#" in result.text
        assert result.input_tokens > 0
        assert result.output_tokens > 0


@pytest.mark.integration
class TestOpenAINoteIntegration:
    """Real API calls to OpenAI for note generation."""

    @pytest.fixture(autouse=True)
    def _require_api_key(self) -> None:
        if not os.getenv("OPENAI_API_KEY"):
            pytest.skip("OPENAI_API_KEY not set")

    def _make_client(self) -> OpenAILLMClient:
        return OpenAILLMClient()

    def test_generates_markdown_notes(self) -> None:
        client = self._make_client()
        user_prompt = build_note_generation_user_prompt("The water cycle", length=NoteLength.SHORT)
        result = client.complete(
            system=NOTE_GENERATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=4096,
        )

        assert len(result.text) > 100
        assert "#" in result.text
        assert result.input_tokens > 0
        assert result.output_tokens > 0
