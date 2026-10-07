"""Tests for the Notes feature.

Covers: schema validation, version concurrency, reindex flag, stale-note indexing,
AI generation error handling, and prompt construction.

Run:  pytest tests/test_notes.py
"""

from __future__ import annotations

import os
import time
from unittest.mock import ANY, MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.enums import NoteLength
from app.schemas.note import NoteBase, NoteChunkEdit, NoteCreate, NoteGenerate, NoteUpdate
from app.services.llm import AnthropicLLMClient, CompletionResult, OpenAILLMClient
from app.services.note_prompts import (
    NOTE_CHUNK_EDIT_SYSTEM_PROMPT,
    NOTE_GENERATION_SYSTEM_PROMPT,
    NOTE_REFINEMENT_SYSTEM_PROMPT,
    build_note_generation_user_prompt,
)
from app.services.note_service import _build_snippet
from app.services.note_text import (
    clean_note_for_embedding,
    markdown_to_plain_text,
    strip_callouts_and_toggles,
    strip_color_spans,
    tables_to_text,
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

    def test_generate_topic_max_length(self) -> None:
        with pytest.raises(ValidationError, match="at most 200"):
            NoteGenerate(topic="t" * 201)

    def test_generate_topic_at_max_length_accepted(self) -> None:
        gen = NoteGenerate(topic="t" * 200)
        assert len(gen.topic) == 200


class TestNoteInputLimits:
    def test_tags_are_normalized(self) -> None:
        note = NoteCreate(title="T", tags=["  Verbs ", "verbs", "", "   ", "Grammar"])
        assert note.tags == ["verbs", "grammar"]

    def test_update_tags_are_normalized(self) -> None:
        assert NoteUpdate(version=1, tags=[" A ", "a"]).tags == ["a"]

    def test_update_without_tags_stays_none(self) -> None:
        assert NoteUpdate(version=1).tags is None

    @pytest.mark.parametrize("field", ["title", "content", "tags"])
    def test_update_explicit_null_rejected(self, field: str) -> None:
        with pytest.raises(ValidationError, match="cannot be null"):
            NoteUpdate.model_validate({field: None, "version": 1})

    def test_too_many_tags_rejected(self) -> None:
        with pytest.raises(ValidationError, match="at most 10 tags"):
            NoteCreate(title="T", tags=[f"tag{i}" for i in range(11)])

    def test_ten_tags_accepted(self) -> None:
        assert len(NoteCreate(title="T", tags=[f"tag{i}" for i in range(10)]).tags) == 10

    def test_duplicates_do_not_count_toward_the_limit(self) -> None:
        note = NoteCreate(title="T", tags=[f"tag{i}" for i in range(10)] + ["TAG0"])
        assert len(note.tags) == 10

    def test_long_tag_rejected(self) -> None:
        with pytest.raises(ValidationError, match="longer than 25"):
            NoteUpdate(version=1, tags=["x" * 26])

    def test_content_limit(self) -> None:
        NoteCreate(title="T", content="x" * 50_000)
        with pytest.raises(ValidationError):
            NoteCreate(title="T", content="x" * 50_001)
        with pytest.raises(ValidationError):
            NoteUpdate(version=1, content="x" * 50_001)

    def test_chunk_edit_full_text_limit(self) -> None:
        with pytest.raises(ValidationError):
            NoteChunkEdit(full_text="x" * 50_001, selected_text="x", instructions="shorter")

    def test_read_schema_has_no_input_limits(self) -> None:
        """NoteRead must serialize a note that is over the input limits (older or AI-generated notes)."""
        NoteBase(title="T", content="x" * 60_000, tags=[f"t{i}" for i in range(15)])


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
    note.deleted_at = None  # live by default
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


class TestUpdateNoteRowLock:
    def test_update_loads_note_with_row_lock(self) -> None:
        """update_note must fetch with SELECT … FOR UPDATE, so two PATCHes with the same version cannot both pass."""
        from app.services.note_service import update_note

        db = MagicMock()
        note = _make_note(version=1)

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=note) as mock_get,
            patch("app.services.note_service.note_crud") as mock_crud,
        ):
            mock_crud.update.return_value = note
            update_note(
                db,
                note_id="note-abc",
                current_user=_make_user(),
                data=NoteUpdate(title="new", version=1),
            )

        assert mock_get.call_args.kwargs["fetch"] is mock_crud.get_by_id_for_update


# ---------------------------------------------------------------------------
# Indexing — version guard
# ---------------------------------------------------------------------------


class TestIndexNoteVersionGuard:
    def _run_index(self, *, mark_indexed_result: bool) -> MagicMock:
        from app.services import embedding_service

        db = MagicMock()
        note = _make_note(version=3)
        note.title = "Title"
        note.tags = []

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud"),
            patch("app.services.embedding_service.token_usage_crud"),
            patch("app.services.embedding_service.calculate_cost", return_value=0),
            patch("app.services.embedding_service._generate_embeddings", return_value=([[0.1] * 1536], 5)),
        ):
            mock_note_crud.get_by_id.return_value = note
            mock_note_crud.mark_indexed.return_value = mark_indexed_result
            embedding_service.index_note(db, note_id="note-abc")

        return mock_note_crud

    def test_marks_indexed_with_version_read_before_embedding(self) -> None:
        """The conditional update must use the version read at the start, not a later one."""
        mock_note_crud = self._run_index(mark_indexed_result=True)
        mock_note_crud.mark_indexed.assert_called_once_with(ANY, note_id="note-abc", version=3)

    def test_changed_note_is_not_forced_to_indexed(self) -> None:
        """If the note changed during embedding, index_note must not set is_indexed itself."""
        mock_note_crud = self._run_index(mark_indexed_result=False)
        mock_note_crud.mark_indexed.assert_called_once()
        mock_note_crud.update.assert_not_called()

    def test_skips_when_another_run_holds_the_lock(self) -> None:
        """A second run on the same note must not delete and insert chunks while the first runs."""
        from app.services import embedding_service

        db = MagicMock()

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud") as mock_chunk_crud,
            patch("app.services.embedding_service._generate_embeddings") as mock_embed,
        ):
            mock_chunk_crud.try_lock_note_indexing.return_value = False
            embedding_service.index_note(db, note_id="note-abc")

        mock_note_crud.get_by_id.assert_not_called()
        mock_chunk_crud.delete_by_note_id.assert_not_called()
        mock_embed.assert_not_called()


# ---------------------------------------------------------------------------
# Search — lazy stale-note indexing
# ---------------------------------------------------------------------------


class TestSearchNotesLazyIndexing:
    def test_stale_notes_indexed_before_search(self) -> None:
        """search_notes must index unindexed notes, each in its own session, before the vector query."""
        from app.services import embedding_service

        db = MagicMock()

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud") as mock_chunk_crud,
            patch("app.services.embedding_service.note_service.schedule_indexing") as mock_schedule,
            patch("app.services.embedding_service._generate_embeddings", return_value=([[0.1] * 1536], 5)),
        ):
            mock_note_crud.list_unindexed_ids_by_user.return_value = ["stale-1", "stale-2"]
            mock_chunk_crud.count_by_user.return_value = 0  # after indexing still 0 → early return

            embedding_service.search_notes(db, user_id="user-123", query="test")

        assert mock_schedule.call_count == 2
        mock_schedule.assert_any_call("stale-1")
        mock_schedule.assert_any_call("stale-2")

    def test_stale_index_failure_does_not_abort_search(self) -> None:
        """A failure indexing one stale note must not prevent the search from continuing."""
        from app.services import embedding_service

        db = MagicMock()

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud") as mock_chunk_crud,
            patch(
                "app.services.embedding_service.note_service.schedule_indexing",
                side_effect=Exception("embed fail"),
            ),
        ):
            mock_note_crud.list_unindexed_ids_by_user.return_value = ["stale-1"]
            mock_chunk_crud.count_by_user.return_value = 0

            # Must not raise
            result = embedding_service.search_notes(db, user_id="user-123", query="test")

        assert result == []

    def test_lazy_indexing_does_not_touch_caller_session(self) -> None:
        """The caller's session must not be committed or rolled back by the stale-note indexing."""
        from app.services import embedding_service

        db = MagicMock()

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud") as mock_chunk_crud,
            patch(
                "app.services.embedding_service.note_service.schedule_indexing",
                side_effect=Exception("cost fail"),
            ),
        ):
            mock_note_crud.list_unindexed_ids_by_user.return_value = ["stale-1"]
            mock_chunk_crud.count_by_user.return_value = 0

            embedding_service.search_notes(db, user_id="user-123", query="test")

        db.rollback.assert_not_called()
        db.commit.assert_not_called()

    def test_query_usage_is_committed(self) -> None:
        """The query-embedding usage row must be committed, not only flushed."""
        from app.services import embedding_service

        db = MagicMock()

        with (
            patch("app.services.embedding_service.note_crud") as mock_note_crud,
            patch("app.services.embedding_service.note_chunk_crud") as mock_chunk_crud,
            patch("app.services.embedding_service.token_usage_crud") as mock_usage_crud,
            patch("app.services.embedding_service.calculate_cost", return_value=0),
            patch("app.services.embedding_service._generate_embeddings", return_value=([[0.1] * 1536], 5)),
        ):
            mock_note_crud.list_unindexed_ids_by_user.return_value = []
            mock_chunk_crud.count_by_user.return_value = 3
            mock_chunk_crud.search_by_similarity.return_value = []

            embedding_service.search_notes(db, user_id="user-123", query="test")

        mock_usage_crud.create.assert_called_once()
        db.commit.assert_called_once()


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

    def test_edit_prompts_keep_color_spans(self) -> None:
        assert "data-color" in NOTE_REFINEMENT_SYSTEM_PROMPT
        assert "data-color" in NOTE_CHUNK_EDIT_SYSTEM_PROMPT

    def test_edit_prompts_keep_table_html(self) -> None:
        for prompt in (NOTE_REFINEMENT_SYSTEM_PROMPT, NOTE_CHUNK_EDIT_SYSTEM_PROMPT):
            assert "<table>" in prompt
            assert "colwidth" in prompt
            assert "pipe table" in prompt

    def test_generation_prompt_asks_for_pipe_tables(self) -> None:
        assert "pipe tables" in NOTE_GENERATION_SYSTEM_PROMPT


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
# RAG — table HTML to text
# ---------------------------------------------------------------------------


class TestTablesToText:
    def test_cells_and_rows(self) -> None:
        html = (
            "<table>\n<tr>\n<th>Verb</th>\n<th>Meaning</th>\n</tr>\n<tr>\n<td>ir</td>\n<td>to go</td>\n</tr>\n</table>"
        )
        assert tables_to_text(html) == "Verb | Meaning\nir | to go"

    def test_attributes_are_dropped(self) -> None:
        html = '<table data-layout="full"><tr><th colwidth="120" data-color="red" data-bg="yellow">A</th></tr></table>'
        assert tables_to_text(html) == "A"

    def test_marks_entities_and_paragraphs(self) -> None:
        html = "<table><tr><td><strong>a</strong> &lt; b &amp; c</td><td><p>one</p><p>two</p></td></tr></table>"
        assert tables_to_text(html) == "a < b & c | one two"

    def test_empty_cell_and_newline_entity(self) -> None:
        html = "<table><tr><td></td><td>x&#10;y</td></tr></table>"
        assert tables_to_text(html) == " | x y"

    def test_text_around_table_is_kept(self) -> None:
        html = "before\n\n<table><tr><td>a</td><td>b</td></tr></table>\n\nafter"
        assert tables_to_text(html) == "before\n\na | b\n\nafter"

    def test_pipe_table_is_unchanged(self) -> None:
        md = "| a | b |\n| --- | --- |\n| 1 | 2 |"
        assert tables_to_text(md) == md

    def test_clean_note_strips_spans_inside_cells(self) -> None:
        html = '<table><tr><td><span data-color="red">hot</span></td><td>cold</td></tr></table>'
        assert clean_note_for_embedding(html) == "hot | cold"


class TestCalloutsAndToggles:
    def test_callout_marker_line_is_removed_and_text_kept(self) -> None:
        md = "> [!TIP]\n> Drink water.\n\nNext."
        assert strip_callouts_and_toggles(md) == "> Drink water.\n\nNext."

    @pytest.mark.parametrize("kind", ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION", "warning"])
    def test_all_callout_types(self, kind: str) -> None:
        assert strip_callouts_and_toggles(f"> [!{kind}]\n> body") == "> body"

    def test_marker_inside_a_normal_line_is_kept(self) -> None:
        md = "Use [!TIP] syntax."
        assert strip_callouts_and_toggles(md) == md

    def test_plain_quote_is_unchanged(self) -> None:
        md = "> A quote."
        assert strip_callouts_and_toggles(md) == md

    def test_toggle_tags_are_removed_and_text_kept(self) -> None:
        md = "<details>\n<summary>Title</summary>\n\nHidden text.\n\n</details>"
        cleaned = strip_callouts_and_toggles(md)
        assert "<" not in cleaned
        assert "Title" in cleaned
        assert "Hidden text." in cleaned

    def test_toggle_on_one_line_keeps_title_and_content_apart(self) -> None:
        cleaned = strip_callouts_and_toggles("<details><summary>Title</summary>Body</details>")
        assert cleaned.split() == ["Title", "Body"]

    def test_clean_note_handles_all_note_syntaxes(self) -> None:
        md = (
            '> [!NOTE]\n> <span data-color="red">hot</span>\n\n<details>\n<summary>More</summary>\n\ncold\n\n</details>'
        )
        cleaned = clean_note_for_embedding(md)
        assert "[!NOTE]" not in cleaned
        assert "<" not in cleaned
        assert "hot" in cleaned and "More" in cleaned and "cold" in cleaned


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

    def test_bad_folder_does_not_call_llm(self) -> None:
        """The folder check runs before the AI call, so a bad folder costs no tokens."""
        from app.services.note_service import generate_note

        db = MagicMock()
        data = NoteGenerate(topic="test topic", folder_id="missing")
        err = HTTPException(status_code=404, detail="Folder not found")

        with (
            patch("app.services.note_service.get_live_folder_or_404", side_effect=err),
            patch("app.services.note_service.complete_for_user") as mock_llm,
            pytest.raises(HTTPException) as exc_info,
        ):
            generate_note(db, current_user=_make_user(), data=data)

        assert exc_info.value.status_code == 404
        mock_llm.assert_not_called()

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
            assert call_kwargs["title"] == "Spanish verbs"
            assert "## Spanish Verbs" in call_kwargs["content"]
            db.commit.assert_called_once()
            db.refresh.assert_called_once_with(mock_note)
            assert result == mock_note


class TestEditTruncation:
    def _completion(self, *, truncated: bool) -> CompletionResult:
        return CompletionResult(
            text="partial", input_tokens=10, output_tokens=20, provider="anthropic", model="test", truncated=truncated
        )

    def test_max_tokens_grows_with_input_and_is_capped(self) -> None:
        from app.services.note_service import _edit_max_tokens

        assert _edit_max_tokens("short") == 4096
        assert 4096 < _edit_max_tokens("x" * 30_000) < 16_384
        assert _edit_max_tokens("x" * 50_000) == 16_384

    def test_truncated_chunk_edit_returns_422_and_keeps_usage(self) -> None:
        from app.services.note_service import edit_note_chunk

        db = MagicMock()
        data = NoteChunkEdit(full_text="full", selected_text="sel", instructions="fix")

        with (
            patch("app.services.note_service.get_live_note", return_value=_make_note()),
            patch("app.services.note_service.complete_for_user", return_value=self._completion(truncated=True)),
            patch("app.services.note_service.token_usage_service") as mock_usage,
            pytest.raises(HTTPException) as exc_info,
        ):
            edit_note_chunk(db, note_id="n1", current_user=_make_user(), data=data)

        assert exc_info.value.status_code == 422
        mock_usage.record_usage.assert_called_once()
        db.commit.assert_called_once()

    def test_chunk_edit_commits_usage(self) -> None:
        from app.services.note_service import edit_note_chunk

        db = MagicMock()
        data = NoteChunkEdit(full_text="full", selected_text="sel", instructions="fix")

        with (
            patch("app.services.note_service.get_live_note", return_value=_make_note()),
            patch("app.services.note_service.complete_for_user", return_value=self._completion(truncated=False)),
            patch("app.services.note_service.token_usage_service"),
        ):
            result = edit_note_chunk(db, note_id="n1", current_user=_make_user(), data=data)

        assert result.edited_text == "partial"
        db.commit.assert_called_once()

    def test_refine_returns_old_and_new_content_and_commits(self) -> None:
        from app.services.note_service import preview_refine_note

        db = MagicMock()
        note = _make_note(version=1)
        note.content = "Some content"

        with (
            patch("app.services.note_service.get_live_note", return_value=note),
            patch("app.services.note_service.complete_for_user", return_value=self._completion(truncated=False)),
            patch("app.services.note_service.token_usage_service"),
        ):
            result = preview_refine_note(db, note_id="n1", current_user=_make_user(), instructions="fix")

        assert result == ("Some content", "partial")
        db.commit.assert_called_once()

    def test_truncated_refine_returns_422(self) -> None:
        from app.services.note_service import preview_refine_note

        db = MagicMock()
        note = _make_note(version=1)
        note.content = "Some content"

        with (
            patch("app.services.note_service.get_live_note", return_value=note),
            patch("app.services.note_service.complete_for_user", return_value=self._completion(truncated=True)),
            patch("app.services.note_service.token_usage_service"),
            pytest.raises(HTTPException) as exc_info,
        ):
            preview_refine_note(db, note_id="n1", current_user=_make_user(), instructions="fix")

        assert exc_info.value.status_code == 422


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


# ---------------------------------------------------------------------------
# P1-1: generate_note validates folder ownership before calling the LLM
# ---------------------------------------------------------------------------


class TestGenerateNoteFolderValidation:
    def test_invalid_folder_prevents_llm_call(self) -> None:
        """An invalid or unowned folder_id must raise 404/403 before spending AI tokens."""
        from app.services import note_service

        db = MagicMock()
        user = MagicMock()
        user.id = "u1"

        data = NoteGenerate(topic="Photosynthesis", folder_id="bad-folder")

        with (
            patch("app.services.note_service._validate_folder_ownership") as mock_validate,
            patch("app.services.note_service.complete_for_user") as mock_llm,
        ):
            mock_validate.side_effect = HTTPException(status_code=404, detail="Folder not found")
            with pytest.raises(HTTPException) as exc_info:
                note_service.generate_note(db, current_user=user, data=data)

        # LLM must not have been called.
        mock_llm.assert_not_called()
        assert exc_info.value.status_code == 404


class TestBuildSnippet:
    def test_short_content_is_returned_whole(self) -> None:
        assert _build_snippet("Cells\nhave a Nucleus", "nucleus") == "Cells have a Nucleus"

    def test_long_content_is_cut_around_the_hit_with_ellipses(self) -> None:
        snippet = _build_snippet("a" * 200 + "NEEDLE" + "b" * 200, "needle")

        assert "NEEDLE" in snippet
        assert snippet.startswith("…") and snippet.endswith("…")
        assert len(snippet) <= 82

    def test_markdown_syntax_is_removed(self) -> None:
        md = '```python\nprint("Minor")\n```\n\n---\n\n## JavaScript\n\n**JavaScript** powers [the web](https://x.dev).'

        assert _build_snippet(md, "powers") == '…Minor") JavaScript JavaScript powers the web.'

    def test_editor_html_is_removed(self) -> None:
        md = '> [!TIP]\n> A <span data-color="red">red</span> cell: <table><tr><td>ir</td></tr></table>'

        assert _build_snippet(md, "red") == "A red cell: ir"

    def test_hit_only_in_hidden_markup_gives_no_snippet(self) -> None:
        """`red` is in the color span tag only, `table` in the table tag only: no real hit."""
        md = '<span data-color="red">text</span>\n\n<table><tr><td>cell</td></tr></table>'

        assert _build_snippet(md, "red") is None
        assert _build_snippet(md, "table") is None
        assert _build_snippet(md, "cell") == "text cell"

    def test_hit_only_in_a_link_url_gives_no_snippet(self) -> None:
        assert _build_snippet("see [the web](https://secret.dev) now", "secret") is None

    @pytest.mark.parametrize(
        ("md", "query", "kept"),
        [
            ("call `__init__` first", "__init__", "__init__"),
            ("```python\nclass A:\n    def __init__(self): ...\n```", "__init__", "__init__(self)"),
            ('```python\nif __name__ == "__main__":\n    run()\n```', "__name__", 'if __name__ == "__main__":'),
            ("the type `List<String>` here", "List<String>", "List<String>"),
            ("```java\nList<String> names;\n```", "List<String>", "List<String> names;"),
        ],
    )
    def test_code_is_kept_as_written(self, md: str, query: str, kept: str) -> None:
        snippet = _build_snippet(md, query)

        assert snippet is not None
        assert kept in snippet
        assert "`" not in snippet

    def test_query_with_two_spaces_matches_collapsed_text(self) -> None:
        assert _build_snippet("a b c", "a  b") == "a b c"

    def test_long_hit_is_not_cut(self) -> None:
        query = "word " * 40 + "end"

        assert query in _build_snippet("x " * 50 + query, query)


class TestMarkdownToPlainText:
    @pytest.mark.parametrize(
        ("markdown", "expected"),
        [
            # Marks inside a word stay: `_` and `*` are not emphasis there.
            ("snake_case_names", "snake_case_names"),
            ("call my_func_name now", "call my_func_name now"),
            ("2*3*4", "2*3*4"),
            ("a <b and c> d", "a d"),
            # A `<` or `>` that is not a tag stays.
            ("a < b and c > d", "a < b and c > d"),
            ("x <= y >= z", "x <= y >= z"),
            # Editor HTML: opening and closing tags go, the text stays.
            ('A <span data-color="red">red</span> word', "A red word"),
            # Emphasis at word edges.
            ("**bold** text", "bold text"),
            ("a *it* b", "a it b"),
            ("a _it_ b", "a it b"),
            ("a __strong__ b", "a strong b"),
            ("~~gone~~ and `code`", "gone and code"),
            # Code is literal: no emphasis, tag, link or line-prefix rule applies inside it.
            ("`__init__` and `a*b*c`", "__init__ and a*b*c"),
            ('use `<span data-color="red">x</span>` ok', 'use <span data-color="red">x</span> ok'),
            ("`[a](b)` and `**x**`", "[a](b) and **x**"),
            ("```\n# not a title\n- not an item\n&amp; <b>x</b>\n```", "# not a title - not an item &amp; <b>x</b>"),
            ("~~~\n__x__\n~~~", "__x__"),
            # A longer fence is not closed by a shorter one.
            ("````\n```\n__x__\n````\nafter", "``` __x__ after"),
            # An unclosed fence runs to the end.
            ("before\n```\n__x__", "before __x__"),
            # A placeholder character typed by the user is not read as a placeholder.
            ("a \ue0000\ue001 b `c`", "a 0 b c"),
            ("(**bold**)", "(bold)"),
            ("un**believ**able", "unbelievable"),
            # Links and images keep their text, lose the URL.
            ("[the web](https://x.dev) now", "the web now"),
            ("![alt text](img.png) after", "alt text after"),
            ("[a](u) and [b](v)", "a and b"),
            ("[not a link] (but text)", "[not a link] (but text)"),
            # Line prefixes.
            ("## Title\n- item\n1. first", "Title item first"),
        ],
    )
    def test_cases(self, markdown: str, expected: str) -> None:
        assert markdown_to_plain_text(markdown) == expected

    @pytest.mark.parametrize(
        "unit",
        [
            "[",
            "_x ",
            "*x ",
            "![",
            "`x ",
            "<a ",
            "<table>",
            "<table><tr><td>",
            "<table ",
            "<details ",
            "<table><tr ",
            "```\n",
            "~~~x\n",
            "```x\n~~~\n",
        ],
    )
    def test_many_unclosed_marks_run_in_linear_time(self, unit: str) -> None:
        text = unit * 50_000

        started = time.perf_counter()
        markdown_to_plain_text(text)

        assert time.perf_counter() - started < 1.0
