"""Tests for the pure folder-path builder.

Run:  pytest tests/test_folder_paths.py
"""

from __future__ import annotations

from app.models.folder import Folder
from app.services.folder_paths import build_folder_path


def _folder(id: str, name: str, parent_id: str | None = None, orphan_path: list[str] | None = None) -> Folder:
    # Transient ORM object: no session needed for a pure in-memory map.
    return Folder(id=id, user_id="u1", name=name, parent_id=parent_id, orphan_path=orphan_path)


def _map(*folders: Folder) -> dict[str, Folder]:
    return {f.id: f for f in folders}


class TestBuildFolderPath:
    def test_root_without_orphan_path_is_none(self) -> None:
        assert build_folder_path({}, folder_id=None) is None
        assert build_folder_path({}, folder_id=None, orphan_path=[]) is None

    def test_nested_path_is_outermost_first(self) -> None:
        folders = _map(_folder("a", "A"), _folder("b", "B", "a"), _folder("c", "C", "b"))
        assert build_folder_path(folders, folder_id="c") == ["A", "B", "C"]

    def test_orphan_path_of_item_is_appended(self) -> None:
        folders = _map(_folder("p", "P"))
        assert build_folder_path(folders, folder_id="p", orphan_path=["A", "B"]) == ["P", "A", "B"]

    def test_orphan_path_without_parent_gives_path_from_root(self) -> None:
        assert build_folder_path({}, folder_id=None, orphan_path=["A"]) == ["A"]

    def test_orphan_path_of_ancestor_sits_between_its_parent_and_it(self) -> None:
        # "g" was re-parented to "root" after its old parents X, Y were deleted forever: they sit above "g".
        folders = _map(_folder("root", "Root"), _folder("g", "G", "root", orphan_path=["X", "Y"]))
        assert build_folder_path(folders, folder_id="g", orphan_path=["Z"]) == ["Root", "X", "Y", "G", "Z"]

    def test_missing_folder_ends_the_walk(self) -> None:
        folders = _map(_folder("b", "B", "gone"))
        assert build_folder_path(folders, folder_id="b") == ["B"]
        assert build_folder_path(folders, folder_id="unknown") == []

    def test_cycle_does_not_loop_forever(self) -> None:
        folders = _map(_folder("x", "X", "y"), _folder("y", "Y", "x"))
        assert build_folder_path(folders, folder_id="x") == ["Y", "X"]

    def test_trashed_folders_are_used_when_present_in_the_map(self) -> None:
        # The map holds live and trashed folders alike; the builder does not filter.
        trashed = _folder("t", "Trashed", "live")
        folders = _map(_folder("live", "Live"), trashed)
        assert build_folder_path(folders, folder_id="t") == ["Live", "Trashed"]

    def test_slash_in_a_name_stays_in_one_name(self) -> None:
        # The result is a list, so a folder named "A/B" is one item, not two folders.
        folders = _map(_folder("p", "P"), _folder("ab", "A/B", "p"))
        assert build_folder_path(folders, folder_id="ab") == ["P", "A/B"]
