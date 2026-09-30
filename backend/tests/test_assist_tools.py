"""Tests for the AI assistant tools: folder labels, allowed routes, note lookup by owner.

Run:  pytest tests/test_assist_tools.py
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models.folder import Folder
from app.services import assist_tools_service
from app.services.assist_tools import NavigateMetadata


def _folder(id: str, name: str, parent_id: str | None = None) -> Folder:
    # Transient ORM object: no session needed for a pure in-memory map.
    return Folder(id=id, user_id="u1", name=name, parent_id=parent_id, orphan_path=None)


def _user(id: str = "u1") -> MagicMock:
    u = MagicMock()
    u.id = id
    return u


class TestLocationLabel:
    def test_root_is_files(self) -> None:
        assert assist_tools_service._location_label({}, None) == "Files"

    def test_nested_folders_are_joined_with_arrows(self) -> None:
        folders = {f.id: f for f in (_folder("a", "A"), _folder("b", "B", "a"))}
        assert assist_tools_service._location_label(folders, "b") == "Files > A > B"

    def test_slash_in_a_name_is_not_a_separator(self) -> None:
        # Before, the path string was split on "/", so "A/B" showed as two folders.
        folders = {f.id: f for f in (_folder("p", "P"), _folder("ab", "A/B", "p"))}
        assert assist_tools_service._location_label(folders, "ab") == "Files > P > A/B"

    def test_unknown_folder_gives_files(self) -> None:
        assert assist_tools_service._location_label({}, "gone") == "Files"


class TestNavigateTo:
    def _route(self, path: str) -> str:
        result = assist_tools_service.navigate_to(MagicMock(), current_user=_user(), arguments={"path": path})
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
            patch("app.services.assist_tools_service.note_crud") as mock_note_crud,
            patch("app.services.assist_tools_service.folder_service.load_folder_map", return_value={}),
        ):
            mock_note_crud.list_live_by_ids.return_value = []
            assist_tools_service.search_user_notes(db, current_user=_user("u1"), arguments={"query": "q"})

        mock_note_crud.list_live_by_ids.assert_called_once_with(db, user_id="u1", ids=["n1"])
