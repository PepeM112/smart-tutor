"""Tests for the Folders feature.

Covers: cycle check, sibling uniqueness, cascade delete preview counts,
move_note version isolation, and ownership 404s.

Run:  pytest tests/test_folders.py
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.schemas.folder import FolderCreate, FolderUpdate


# ---------------------------------------------------------------------------
# Helpers — lightweight fakes that avoid a real DB
# ---------------------------------------------------------------------------


def _make_folder(id: str, user_id: str = "u1", parent_id: str | None = None, name: str = "F") -> MagicMock:
    f = MagicMock()
    f.id = id
    f.user_id = user_id
    f.parent_id = parent_id
    f.name = name
    f.deleted_at = None  # live by default
    return f


def _make_note(id: str, user_id: str = "u1", folder_id: str | None = None, version: int = 1) -> MagicMock:
    n = MagicMock()
    n.id = id
    n.user_id = user_id
    n.folder_id = folder_id
    n.version = version
    n.deleted_at = None  # live by default
    return n


def _make_user(id: str = "u1") -> MagicMock:
    u = MagicMock()
    u.id = id
    return u


# ---------------------------------------------------------------------------
# folder_service._assert_no_cycle
# ---------------------------------------------------------------------------


class TestCycleCheck:
    def _run(self, folder_id: str, new_parent_id: str, desc_ids: list[str]) -> None:
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_descendant_ids.return_value = desc_ids
            folder_service._assert_no_cycle(db, folder_id=folder_id, new_parent_id=new_parent_id)

    def test_moving_to_itself_raises_400(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with pytest.raises(HTTPException) as exc_info:
            folder_service._assert_no_cycle(db, folder_id="f1", new_parent_id="f1")
        assert exc_info.value.status_code == 400

    def test_moving_into_own_descendant_raises_400(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_descendant_ids.return_value = ["f2", "f3"]
            with pytest.raises(HTTPException) as exc_info:
                folder_service._assert_no_cycle(db, folder_id="f1", new_parent_id="f3")
        assert exc_info.value.status_code == 400

    def test_valid_move_does_not_raise(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_descendant_ids.return_value = ["f2", "f3"]
            # f4 is not a descendant of f1
            folder_service._assert_no_cycle(db, folder_id="f1", new_parent_id="f4")


# ---------------------------------------------------------------------------
# folder_service._assert_no_sibling_conflict
# ---------------------------------------------------------------------------


class TestSiblingUniqueness:
    def test_conflict_raises_409(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.sibling_name_exists.return_value = True
            with pytest.raises(HTTPException) as exc_info:
                folder_service._assert_no_sibling_conflict(
                    db, user_id="u1", parent_id=None, name="Duplicated"
                )
        assert exc_info.value.status_code == 409
        assert "Duplicated" in exc_info.value.detail

    def test_no_conflict_does_not_raise(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.sibling_name_exists.return_value = False
            folder_service._assert_no_sibling_conflict(
                db, user_id="u1", parent_id=None, name="Unique"
            )


# ---------------------------------------------------------------------------
# folder_service.get_delete_preview — recursive counts
# ---------------------------------------------------------------------------


class TestDeletePreview:
    def test_preview_counts_include_root_folder(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user()
        with (
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service._get_owned_folder_or_404") as mock_get,
        ):
            mock_get.return_value = _make_folder("f1")
            # 2 sub-folders, 5 notes across the subtree (live only)
            mock_crud.count_live_descendants.return_value = (2, 5)

            preview = folder_service.get_delete_preview(db, folder_id="f1", current_user=user)

        # folder_count includes the root folder itself
        assert preview.folder_count == 3  # 2 descendants + 1 root
        assert preview.note_count == 5

    def test_preview_single_empty_folder(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user()
        with (
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service._get_owned_folder_or_404") as mock_get,
        ):
            mock_get.return_value = _make_folder("f1")
            mock_crud.count_live_descendants.return_value = (0, 0)

            preview = folder_service.get_delete_preview(db, folder_id="f1", current_user=user)

        assert preview.folder_count == 1
        assert preview.note_count == 0


# ---------------------------------------------------------------------------
# note_service.move_note — must NOT touch version
# ---------------------------------------------------------------------------


class TestMoveNote:
    def test_move_note_does_not_bump_version(self) -> None:
        from app.services import note_service

        db = MagicMock()
        user = _make_user()
        note = _make_note("n1", version=3)

        with (
            patch("app.services.note_service.get_note") as mock_get_note,
            patch("app.services.note_service._validate_folder_ownership") as mock_validate,
        ):
            mock_get_note.return_value = note
            mock_validate.return_value = None
            db.commit.return_value = None
            db.refresh.return_value = None

            note_service.move_note(db, note_id="n1", current_user=user, folder_id="f1")

        # version must not have changed
        assert note.version == 3
        assert note.folder_id == "f1"

    def test_move_note_to_root_sets_folder_id_none(self) -> None:
        from app.services import note_service

        db = MagicMock()
        user = _make_user()
        note = _make_note("n1", folder_id="f1")

        with (
            patch("app.services.note_service.get_note") as mock_get_note,
            patch("app.services.note_service._validate_folder_ownership") as mock_validate,
        ):
            mock_get_note.return_value = note
            mock_validate.return_value = None
            db.commit.return_value = None
            db.refresh.return_value = None

            note_service.move_note(db, note_id="n1", current_user=user, folder_id=None)

        assert note.folder_id is None


# ---------------------------------------------------------------------------
# folder_service — ownership 404s
# ---------------------------------------------------------------------------


class TestOwnership:
    def test_get_owned_folder_or_404_raises_404_when_not_found(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u1")
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                folder_service._get_owned_folder_or_404(db, folder_id="missing", current_user=user)
        assert exc_info.value.status_code == 404

    def test_get_owned_folder_or_404_raises_403_for_another_user(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u1")
        other_folder = _make_folder("f1", user_id="u2")
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = other_folder
            with pytest.raises(HTTPException) as exc_info:
                folder_service._get_owned_folder_or_404(db, folder_id="f1", current_user=user)
        assert exc_info.value.status_code == 403
