"""Tests for the Trash feature.

Covers: cascade soft-delete (one timestamp), restore (same batch only, fallback to root),
sibling conflict on restore, 30-day purge, ownership 404, PATCH on trashed note refused.

Run:  pytest tests/test_trash.py
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ts(offset_days: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=offset_days)


def _make_folder(
    id: str,
    user_id: str = "u1",
    parent_id: str | None = None,
    name: str = "F",
    deleted_at: datetime | None = None,
) -> MagicMock:
    f = MagicMock()
    f.id = id
    f.user_id = user_id
    f.parent_id = parent_id
    f.name = name
    f.deleted_at = deleted_at
    return f


def _make_note(
    id: str,
    user_id: str = "u1",
    folder_id: str | None = None,
    deleted_at: datetime | None = None,
    version: int = 1,
) -> MagicMock:
    n = MagicMock()
    n.id = id
    n.user_id = user_id
    n.folder_id = folder_id
    n.deleted_at = deleted_at
    n.version = version
    return n


def _make_user(id: str = "u1") -> MagicMock:
    u = MagicMock()
    u.id = id
    return u


# ---------------------------------------------------------------------------
# folder_service.delete_folder — cascade soft-delete uses one timestamp
# ---------------------------------------------------------------------------


class TestCascadeSoftDelete:
    def test_cascade_sets_deleted_at_and_commits(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user()
        with (
            patch("app.services.folder_service._get_owned_folder_or_404") as mock_get,
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service.datetime") as mock_dt,
        ):
            now = _ts()
            mock_dt.now.return_value = now
            mock_get.return_value = _make_folder("f1")
            mock_crud.soft_delete_cascade.return_value = (2, 3)

            folder_service.delete_folder(db, folder_id="f1", current_user=user)

        # The same `now` is passed to soft_delete_cascade.
        mock_crud.soft_delete_cascade.assert_called_once_with(db, folder_id="f1", now=now)
        db.commit.assert_called_once()

    def test_trashed_folder_is_rejected_as_404(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            trashed = _make_folder("f1", deleted_at=_ts(1))
            mock_crud.get_by_id.return_value = trashed
            with pytest.raises(HTTPException) as exc_info:
                folder_service._get_owned_folder_or_404(db, folder_id="f1", current_user=user)
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# note_service._assert_note_live — PATCH on trashed note raises 409
# ---------------------------------------------------------------------------


class TestTrashedNoteRejected:
    def test_update_trashed_note_raises_409(self) -> None:
        from app.schemas.note import NoteUpdate
        from app.services import note_service

        db = MagicMock()
        user = _make_user()
        trashed = _make_note("n1", deleted_at=_ts(2))

        with patch("app.services.note_service.get_owned_or_404") as mock_get:
            mock_get.return_value = trashed
            data = NoteUpdate(version=1)
            with pytest.raises(HTTPException) as exc_info:
                note_service.update_note(db, note_id="n1", current_user=user, data=data)

        assert exc_info.value.status_code == 409
        assert "Trash" in exc_info.value.detail

    def test_move_trashed_note_raises_409(self) -> None:
        from app.services import note_service

        db = MagicMock()
        user = _make_user()
        trashed = _make_note("n1", deleted_at=_ts(1))

        with patch("app.services.note_service.get_note") as mock_get:
            mock_get.return_value = trashed
            with pytest.raises(HTTPException) as exc_info:
                note_service.move_note(db, note_id="n1", current_user=user, folder_id=None)

        assert exc_info.value.status_code == 409


# ---------------------------------------------------------------------------
# trash_service.restore_folder — same-batch-only, fallback to root
# ---------------------------------------------------------------------------


class TestRestoreFolder:
    def test_restore_moves_to_root_when_parent_is_trashed(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        user = _make_user()
        now = _ts(1)
        folder = _make_folder("f1", parent_id="fp", deleted_at=now)
        trashed_parent = _make_folder("fp", deleted_at=_ts(2))

        with (
            patch("app.services.trash_service._get_trashed_folder_or_404") as mock_get,
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            mock_get.return_value = folder
            mock_crud.get_by_id.return_value = trashed_parent
            # sibling_name_exists: no conflict
            mock_crud.sibling_name_exists.return_value = False
            mock_crud.restore_folder_batch.return_value = None

            trash_service.restore_folder(db, folder_id="f1", current_user=user)

        # Parent was trashed, so effective parent becomes None (root).
        assert folder.parent_id is None
        db.commit.assert_called_once()

    def test_restore_keeps_original_parent_when_live(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        user = _make_user()
        now = _ts(1)
        folder = _make_folder("f1", parent_id="fp", deleted_at=now)
        live_parent = _make_folder("fp", deleted_at=None)

        with (
            patch("app.services.trash_service._get_trashed_folder_or_404") as mock_get,
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            mock_get.return_value = folder
            mock_crud.get_by_id.return_value = live_parent
            mock_crud.sibling_name_exists.return_value = False
            mock_crud.restore_folder_batch.return_value = None

            trash_service.restore_folder(db, folder_id="f1", current_user=user)

        assert folder.parent_id == "fp"

    def test_sibling_conflict_renames_with_restored_suffix(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        user = _make_user()
        now = _ts(1)
        folder = _make_folder("f1", name="Notes", deleted_at=now)

        with (
            patch("app.services.trash_service._get_trashed_folder_or_404") as mock_get,
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            mock_get.return_value = folder
            mock_crud.get_by_id.return_value = None  # parent gone → root
            # First call (original name) conflicts; second call (restored suffix) does not.
            mock_crud.sibling_name_exists.side_effect = [True, False]
            mock_crud.restore_folder_batch.return_value = None

            trash_service.restore_folder(db, folder_id="f1", current_user=user)

        assert folder.name == "Notes (restored)"


# ---------------------------------------------------------------------------
# trash_service — ownership 404
# ---------------------------------------------------------------------------


class TestTrashOwnership:
    def test_restore_another_users_folder_raises_403(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        user = _make_user("u1")
        other_folder = _make_folder("f1", user_id="u2", deleted_at=_ts(1))

        with patch("app.services.trash_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = other_folder
            with pytest.raises(HTTPException) as exc_info:
                trash_service._get_trashed_folder_or_404(db, folder_id="f1", current_user=user)
        assert exc_info.value.status_code == 403

    def test_restore_live_folder_raises_404(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        user = _make_user()
        live_folder = _make_folder("f1", deleted_at=None)

        with patch("app.services.trash_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = live_folder
            with pytest.raises(HTTPException) as exc_info:
                trash_service._get_trashed_folder_or_404(db, folder_id="f1", current_user=user)
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# trash_service._purge_expired — calls the CRUD purge helpers with the cutoff
# ---------------------------------------------------------------------------


class TestPurge:
    def test_purge_passes_30_day_cutoff(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        now = datetime(2026, 9, 28, 0, 0, 0, tzinfo=timezone.utc)
        expected_cutoff = now - timedelta(days=30)

        with (
            patch("app.services.trash_service.folder_crud") as mock_crud,
            patch("app.services.trash_service.datetime") as mock_dt,
        ):
            mock_dt.now.return_value = now
            trash_service._purge_expired(db, user_id="u1")

        mock_crud.purge_old_folders.assert_called_once_with(db, user_id="u1", before=expected_cutoff)
        mock_crud.purge_old_notes.assert_called_once_with(db, user_id="u1", before=expected_cutoff)
        db.commit.assert_called_once()
