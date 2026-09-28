"""Tests for the Notes feature.

Covers: schema validation, version concurrency, reindex flag, stale-note indexing,
AI generation error handling, and prompt construction.

Run:  pytest tests/test_notes.py
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.enums import NoteLength, NoteSource
from app.schemas.note import NoteBase, NoteCreate, NoteGenerate, NoteUpdate
from app.services.embedding_service import strip_color_spans
from app.services.llm import AnthropicLLMClient, CompletionResult, OpenAILLMClient
from app.services.note_prompts import (
    NOTE_CHUNK_EDIT_SYSTEM_PROMPT,
    NOTE_GENERATION_SYSTEM_PROMPT,
    NOTE_REFINEMENT_SYSTEM_PROMPT,
    build_note_generation_user_prompt,
)

# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


class TestNoteSchemaValidation:
    def test_title_at_max_length_accepted(self) -> None:
        note = NoteBase(title="x" * 200)
        assert len(note.title) == 200

    def test_title_exceeding_max_length_rejected(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteBase(title="x" * 201)

    def test_create_inherits_validation(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteCreate(title="x" * 201)

    def test_update_title_max_length(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteUpdate(title="x" * 201, version=1)

    def test_update_version_required(self) -> None:
        with pytest.raises(ValidationError):
            NoteUpdate(title="hello")  # version missing

    def test_update_minimal_accepted(self) -> None:
        update = NoteUpdate(version=1)
        assert update.title is None
        assert update.content is None
        assert update.tags is None
        assert update.version == 1
        assert update.reindex is False

    def test_update_reindex_flag_default_false(self) -> None:
        update = NoteUpdate(version=1)
        assert update.reindex is False

    def test_update_reindex_flag_set_true(self) -> None:
        update = NoteUpdate(version=1, reindex=True)
        assert update.reindex is True

    def test_generate_topic_max_length(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteGenerate(topic="t" * 201)

    def test_generate_topic_at_max_length_accepted(self) -> None:
        gen = NoteGenerate(topic="t" * 200)
        assert len(gen.topic) == 200


# ---------------------------------------------------------------------------
# Version concurrency — service-level
# ---------------------------------------------------------------------------


def _make_user() -> MagicMock:
    user = MagicMock()
    user.id = "user-123"
    return user


def _make_note(version: int = 1) -> MagicMock:
    note = MagicMock()
    note.id = "note-abc"
    note.user_id = "user-123"
    note.version = version
    note.content = "existing content"
    note.is_indexed = True
    return note


class TestNoteVersioning:
    def test_version_mismatch_raises_409(self) -> None:
        """Sending version=1 when the server note is already at version=2 → 409."""
        from app.services.note_service import update_note

        db = MagicMock()
        note = _make_note(version=2)

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=note),
            pytest.raises(HTTPException) as exc_info,
        ):
            update_note(
                db,
                note_id="note-abc",
                current_user=_make_user(),
                data=NoteUpdate(content="new text", version=1),
            )

        assert exc_info.value.status_code == 409
        assert exc_info.value.detail == "Note was modified elsewhere"

    def test_version_match_increments_version(self) -> None:
        """Successful update increments version by 1 on the ORM object."""
        from app.services.note_service import update_note

        db = MagicMock()
        note = _make_note(version=3)

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=note),
            patch("app.services.note_service.note_crud") as mock_crud,
        ):
            mock_crud.update.return_value = note
            update_note(
                db,
                note_id="note-abc",
                current_user=_make_user(),
                data=NoteUpdate(content="updated content", version=3),
            )

        assert note.version == 4
        assert note.is_indexed is False

    def test_only_reindex_flag_does_not_bump_version(self) -> None:
        """A PATCH with only reindex=True and no content/title/tags must not change version."""
        from app.services.note_service import update_note

        db = MagicMock()
        note = _make_note(version=5)

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=note),
            patch("app.services.note_service.note_crud") as mock_crud,
        ):
            mock_crud.update.return_value = note
            update_note(
                db,
                note_id="note-abc",
                current_user=_make_user(),
                data=NoteUpdate(version=5, reindex=True),
            )

        assert note.version == 5  # unchanged

    def test_version_check_not_applied_on_reindex_only(self) -> None:
        """A stale version sent alongside reindex=True (no content change) does not fail."""
        from app.services.note_service import update_note

        db = MagicMock()
        note = _make_note(version=7)

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=note),
            patch("app.services.note_service.note_crud") as mock_crud,
        ):
            mock_crud.update.return_value = note
            # version=1 is stale but there are no content fields → should not raise
            update_note(
                db,
                note_id="note-abc",
                current_user=_make_user(),
                data=NoteUpdate(version=1, reindex=True),
            )

        # No exception means success
        assert note.version == 7


# ---------------------------------------------------------------------------
# Reindex scheduling — endpoint behaviour
# ---------------------------------------------------------------------------


class TestReindexScheduling:
    """update_note service does not call schedule_indexing; the endpoint does."""

    def test_content_update_does_not_schedule_indexing(self) -> None:
        """Saving content must NOT trigger index_note directly from the service."""
        from app.services.note_service import update_note

        db = MagicMock()
        note = _make_note(version=1)

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=note),
            patch("app.services.note_service.note_crud") as mock_crud,
            patch("app.services.note_service.schedule_indexing") as mock_sched,
        ):
            mock_crud.update.return_value = note
            update_note(
                db,
                note_id="note-abc",
                current_user=_make_user(),
                data=NoteUpdate(content="new content", version=1),
            )

        mock_sched.assert_not_called()

    def test_is_indexed_false_on_content_change(self) -> None:
        """is_indexed must be set to False when content changes."""
        from app.services.note_service import update_note

        db = MagicMock()
        note = _make_note(version=1)
        note.is_indexed = True

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=note),
            patch("app.services.note_service.note_crud") as mock_crud,
        ):
            mock_crud.update.return_value = note
            update_note(
                db,
                note_id="note-abc",
                current_user=_make_user(),
                data=NoteUpdate(content="new content", version=1),
            )

        assert note.is_indexed is False


# ---------------------------------------------------------------------------
# Search — lazy stale-note indexing
# ---------------------------------------------------------------------------


class TestSearchNotesLazyIndexing:
    def test_stale_notes_indexed_before_search(self) -> None:
        """search_notes must index unindexed notes before running the vector query."""
        from app.services import embedding_service

        db = MagicMock()

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud") as mock_chunk_crud,
            patch("app.services.embedding_service.index_note") as mock_index,
            patch("app.services.embedding_service._generate_embeddings", return_value=([[0.1] * 1536], 5)),
        ):
            mock_note_crud.list_unindexed_ids_by_user.return_value = ["stale-1", "stale-2"]
            mock_chunk_crud.count_by_user.return_value = 0  # after indexing still 0 → early return

            embedding_service.search_notes(db, user_id="user-123", query="test")

        assert mock_index.call_count == 2
        mock_index.assert_any_call(db, note_id="stale-1")
        mock_index.assert_any_call(db, note_id="stale-2")

    def test_stale_index_failure_does_not_abort_search(self) -> None:
        """A failure indexing one stale note must not prevent the search from continuing."""
        from app.services import embedding_service

        db = MagicMock()

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud") as mock_chunk_crud,
            patch("app.services.embedding_service.index_note", side_effect=Exception("embed fail")),
            patch("app.services.embedding_service._generate_embeddings", return_value=([[0.1] * 1536], 5)),
        ):
            mock_note_crud.list_unindexed_ids_by_user.return_value = ["stale-1"]
            mock_chunk_crud.count_by_user.return_value = 0

            # Must not raise
            result = embedding_service.search_notes(db, user_id="user-123", query="test")

        assert result == []


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

    def test_edit_prompts_keep_color_spans(self) -> None:
        assert "data-color" in NOTE_REFINEMENT_SYSTEM_PROMPT
        assert "data-color" in NOTE_CHUNK_EDIT_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# RAG — color span stripping
# ---------------------------------------------------------------------------


class TestStripColorSpans:
    def test_keeps_inner_text(self) -> None:
        assert strip_color_spans('a <span data-color="red">red</span> word') == "a red word"

    def test_text_and_background(self) -> None:
        text = '<span data-color="blue" data-bg="yellow">both</span>'
        assert strip_color_spans(text) == "both"

    def test_inside_bold(self) -> None:
        assert strip_color_spans('**<span data-bg="green">key</span>**') == "**key**"

    def test_leaves_other_html(self) -> None:
        assert strip_color_spans("<b>x</b> <span>y</span>") == "<b>x</b> y"


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
# Service-level error handling
# ---------------------------------------------------------------------------


class TestNoteServiceErrorHandling:
    def _mock_completion(self, text: str) -> CompletionResult:
        return CompletionResult(text=text, input_tokens=10, output_tokens=20, provider="anthropic", model="test")

    def test_missing_api_key_returns_403(self) -> None:
        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="test topic")
        err = HTTPException(status_code=403, detail="AI is not configured. Please add your API key in Settings.")

        with (
            patch("app.services.note_service.complete_for_user", side_effect=err),
            pytest.raises(HTTPException) as exc_info,
        ):
            generate_note(db, current_user=_make_user(), data=data)

        assert exc_info.value.status_code == 403
        assert "not configured" in exc_info.value.detail

    def test_provider_value_error_returns_502(self) -> None:
        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="test topic")
        err = HTTPException(status_code=502, detail="AI service returned an invalid response. Please try again.")

        with (
            patch("app.services.note_service.complete_for_user", side_effect=err),
            pytest.raises(HTTPException) as exc_info,
        ):
            generate_note(db, current_user=_make_user(), data=data)

        assert exc_info.value.status_code == 502
        assert "invalid response" in exc_info.value.detail

    def test_successful_generation(self) -> None:
        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="Spanish verbs")
        mock_note = MagicMock()
        mock_note.id = "note-456"
        completion = self._mock_completion("## Spanish Verbs\n\nContent here")

        with (
            patch("app.services.note_service.complete_for_user", return_value=completion),
            patch("app.services.note_service.token_usage_service"),
            patch("app.services.note_service.note_crud") as mock_crud,
        ):
            mock_crud.create.return_value = mock_note
            result = generate_note(db, current_user=_make_user(), data=data)

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
    @pytest.fixture(autouse=True)
    def _require_api_key(self) -> None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            pytest.skip("ANTHROPIC_API_KEY not set")

    def test_generates_markdown_notes(self) -> None:
        client = AnthropicLLMClient()
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
    @pytest.fixture(autouse=True)
    def _require_api_key(self) -> None:
        if not os.getenv("OPENAI_API_KEY"):
            pytest.skip("OPENAI_API_KEY not set")

    def test_generates_markdown_notes(self) -> None:
        client = OpenAILLMClient()
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
