"""Tests for the AI assistant tools: folder labels, allowed routes, note lookup by owner.

Run:  pytest tests/test_assist_tools.py
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models.folder import Folder
from app.services.assist_tools import _helpers, navigation, notes
from app.services.assist_tools.types import NavigateMetadata


def _folder(id: str, name: str, parent_id: str | None = None) -> Folder:
    # Transient ORM object: no session needed for a pure in-memory map.
    return Folder(id=id, user_id="u1", name=name, parent_id=parent_id, orphan_path=None)


def _user(id: str = "u1") -> MagicMock:
    u = MagicMock()
    u.id = id
    return u


class TestLocationLabel:
    def test_root_is_files(self) -> None:
        assert _helpers.location_label({}, None) == "Files"

    def test_nested_folders_are_joined_with_arrows(self) -> None:
        folders = {f.id: f for f in (_folder("a", "A"), _folder("b", "B", "a"))}
        assert _helpers.location_label(folders, "b") == "Files > A > B"

    def test_slash_in_a_name_is_not_a_separator(self) -> None:
        # Before, the path string was split on "/", so "A/B" showed as two folders.
        folders = {f.id: f for f in (_folder("p", "P"), _folder("ab", "A/B", "p"))}
        assert _helpers.location_label(folders, "ab") == "Files > P > A/B"

    def test_unknown_folder_gives_files(self) -> None:
        assert _helpers.location_label({}, "gone") == "Files"


class TestMarkdownPreview:
    def test_short_text_is_kept_whole_with_no_ellipsis(self) -> None:
        assert _helpers.markdown_preview("## Title\n\nText.", 300) == "## Title\n\nText."

    def test_block_that_does_not_fit_is_left_out(self) -> None:
        # The code block goes past the limit, so only the text before it is shown.
        text = "Intro.\n\n```python\nx = 1\n\ny = 2\n```\n\nAfter."
        assert _helpers.markdown_preview(text, 20) == "Intro.\n\n…"

    def test_blank_line_inside_a_code_fence_does_not_split_it(self) -> None:
        text = "```\na\n\nb\n```\n\nAfter."
        assert _helpers.markdown_blocks(text) == ["```\na\n\nb\n```", "After."]

    def test_toggle_with_blank_lines_is_one_block(self) -> None:
        text = "<details>\n<summary>S</summary>\n\nBody.\n\n</details>\n\nAfter."
        assert _helpers.markdown_blocks(text) == ["<details>\n<summary>S</summary>\n\nBody.\n\n</details>", "After."]

    def test_first_block_too_long_gives_empty_preview(self) -> None:
        assert _helpers.markdown_preview("x" * 400, 300) == ""


class TestCreateNotePreview:
    def _output(self, content: str) -> str:
        note = MagicMock(id="n1", title="Cells", content=content)
        with patch.object(notes.note_service, "generate_note", return_value=note):
            result = notes.create_note(MagicMock(), current_user=_user(), arguments={"topic": "Cells"})
        return result.output

    def test_preview_is_a_separate_block(self) -> None:
        assert self._output("## Cells\n\nText.") == (
            "Note created successfully!\n- **Title:** Cells\n\n**Preview:**\n\n## Cells\n\nText."
        )

    def test_no_preview_when_first_block_is_too_long(self) -> None:
        assert self._output("```\n" + "x" * 400 + "\n```") == "Note created successfully!\n- **Title:** Cells"


class TestNavigateTo:
    def _route(self, path: str) -> str:
        result = navigation.navigate_to(MagicMock(), current_user=_user(), arguments={"path": path})
        assert isinstance(result.metadata, NavigateMetadata)
        return result.metadata.route

    def test_trash_is_allowed(self) -> None:
        assert self._route("/trash") == "/trash"

    def test_unknown_route_falls_back_to_dashboard(self) -> None:
        assert self._route("/admin") == "/dashboard"


class TestSearchUserNotes:
    def test_note_lookup_is_filtered_by_owner(self) -> None:
        hit = MagicMock(note_id="n1", note_title="T", chunk_content="text", similarity=0.9)
        db = MagicMock()

        with (
            patch("app.services.embedding_service.search_notes", return_value=[hit]),
            patch("app.services.assist_tools.notes.note_crud") as mock_note_crud,
            patch("app.services.assist_tools.notes.folder_service.load_folder_map", return_value={}),
        ):
            mock_note_crud.list_live_by_ids.return_value = []
            notes.search_user_notes(db, current_user=_user("u1"), arguments={"query": "q"})

        mock_note_crud.list_live_by_ids.assert_called_once_with(db, user_id="u1", ids=["n1"])
