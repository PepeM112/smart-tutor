"""Tests for the Trash feature.

Covers: cascade soft-delete (one timestamp), restore (same batch only, fallback to root),
sibling conflict on restore, 30-day purge, ownership 404, PATCH on trashed note refused.

Run:  pytest tests/test_trash.py
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import ANY, MagicMock, patch

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
    orphan_path: list[str] | None = None,
) -> MagicMock:
    f = MagicMock()
    f.id = id
    f.user_id = user_id
    f.parent_id = parent_id
    f.name = name
    f.deleted_at = deleted_at
    f.orphan_path = orphan_path
    return f


def _make_note(
    id: str,
    user_id: str = "u1",
    folder_id: str | None = None,
    deleted_at: datetime | None = None,
    version: int = 1,
    orphan_path: list[str] | None = None,
) -> MagicMock:
    n = MagicMock()
    n.id = id
    n.user_id = user_id
    n.folder_id = folder_id
    n.deleted_at = deleted_at
    n.version = version
    n.orphan_path = orphan_path
    return n


def _fake_relocate(_db: object, *, folder: MagicMock, name: str, parent_id: str | None) -> MagicMock:
    """Stand-in for folder_crud.relocate (the CRUD module is mocked in service tests)."""
    folder.name = name
    folder.parent_id = parent_id
    folder.orphan_path = None
    return folder


def _fake_restore_row(_db: object, *, folder: MagicMock, name: str, parent_id: str | None) -> MagicMock:
    """Stand-in for folder_crud.restore_row."""
    _fake_relocate(_db, folder=folder, name=name, parent_id=parent_id)
    folder.deleted_at = None
    return folder


def _wire_restore(mock_crud: MagicMock) -> None:
    mock_crud.relocate.side_effect = _fake_relocate
    mock_crud.restore_row.side_effect = _fake_restore_row


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
            patch("app.services.folder_service.get_live_folder_or_404") as mock_get,
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service.datetime") as mock_dt,
        ):
            now = _ts()
            mock_dt.now.return_value = now
            mock_get.return_value = _make_folder("f1")

            folder_service.delete_folder(db, folder_id="f1", current_user=user)

        # The same `now` is passed to soft_delete_cascade.
        mock_crud.soft_delete_cascade.assert_called_once_with(db, user_id="u1", folder_id="f1", now=now)
        db.commit.assert_called_once()

    def test_trashed_folder_is_rejected_as_404(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            trashed = _make_folder("f1", deleted_at=_ts(1))
            mock_crud.get_by_id.return_value = trashed
            with pytest.raises(HTTPException) as exc_info:
                folder_service.get_live_folder_or_404(db, folder_id="f1", current_user=user)
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

        with patch("app.services.note_service.get_owned_or_404") as mock_get:
            mock_get.return_value = trashed
            with pytest.raises(HTTPException) as exc_info:
                note_service.move_note(db, note_id="n1", current_user=user, folder_id=None)

        assert exc_info.value.status_code == 409


# ---------------------------------------------------------------------------
# trash_service.restore_folder — same-batch-only, fallback to root
# ---------------------------------------------------------------------------


class TestRestoreFolder:
    def test_restore_brings_back_trashed_parent_rows(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        user = _make_user()
        folder = _make_folder("f1", parent_id="fp", deleted_at=_ts(1))
        trashed_parent = _make_folder("fp", parent_id=None, deleted_at=_ts(2))

        with (
            patch("app.services.trash_service._get_trashed_folder_or_404") as mock_get,
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            mock_get.return_value = folder
            mock_crud.get_by_id.return_value = trashed_parent
            mock_crud.sibling_name_exists.return_value = False
            _wire_restore(mock_crud)
            trash_service.restore_folder(db, folder_id="f1", current_user=user)

        # The parent row is live again and the folder stays inside it.
        assert trashed_parent.deleted_at is None
        assert folder.parent_id == "fp"
        mock_crud.restore_folder_batch.assert_called_once_with(db, folder=folder)

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

            _wire_restore(mock_crud)

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

            _wire_restore(mock_crud)

            trash_service.restore_folder(db, folder_id="f1", current_user=user)

        assert folder.name == "Notes (restored)"


# ---------------------------------------------------------------------------
# P3-8: an item trashed more than 30 days ago acts as gone before the purge runs
# ---------------------------------------------------------------------------


class TestExpiredTrashActsAsGone:
    def test_get_note_expired_raises_404(self) -> None:
        from app.services import note_service

        with (
            patch("app.services.note_service.get_owned_or_404", return_value=_make_note("n1", deleted_at=_ts(31))),
            pytest.raises(HTTPException) as exc_info,
        ):
            note_service.get_note(MagicMock(), note_id="n1", current_user=_make_user())

        assert exc_info.value.status_code == 404

    def test_get_note_trashed_inside_window_is_returned(self) -> None:
        from app.services import note_service

        note = _make_note("n1", deleted_at=_ts(29))
        with patch("app.services.note_service.get_owned_or_404", return_value=note):
            assert note_service.get_note(MagicMock(), note_id="n1", current_user=_make_user()) is note

    def test_restore_expired_folder_raises_404(self) -> None:
        from app.services import trash_service

        folder = _make_folder("f1", deleted_at=_ts(31))
        with (
            patch("app.services.trash_service.get_owned_or_404", return_value=folder),
            pytest.raises(HTTPException) as exc_info,
        ):
            trash_service._get_trashed_folder_or_404(MagicMock(), folder_id="f1", current_user=_make_user())

        assert exc_info.value.status_code == 404

    def test_restore_expired_note_raises_404(self) -> None:
        from app.services import trash_service

        note = _make_note("n1", deleted_at=_ts(31))
        with (
            patch("app.services.trash_service.get_owned_or_404", return_value=note),
            pytest.raises(HTTPException) as exc_info,
        ):
            trash_service._get_trashed_note_or_404(MagicMock(), note_id="n1", current_user=_make_user())

        assert exc_info.value.status_code == 404

    def test_restore_note_inside_window_is_found(self) -> None:
        from app.services import trash_service

        note = _make_note("n1", deleted_at=_ts(29))
        with patch("app.services.trash_service.get_owned_or_404", return_value=note):
            found = trash_service._get_trashed_note_or_404(MagicMock(), note_id="n1", current_user=_make_user())

        assert found is note


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
# trash_service._purge_expired — each expired batch is deleted like "Delete forever"
# ---------------------------------------------------------------------------


class TestPurge:
    def test_purge_passes_30_day_cutoff(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        now = datetime(2026, 9, 28, 0, 0, 0, tzinfo=timezone.utc)
        expected_cutoff = now - timedelta(days=30)
        expired = [_make_folder("f1", deleted_at=_ts(40)), _make_folder("f2", deleted_at=_ts(35))]

        with (
            patch("app.services.trash_service.folder_crud") as mock_crud,
            patch("app.services.trash_service.note_crud") as mock_note_crud,
            patch("app.services.trash_service.datetime") as mock_dt,
            patch("app.services.trash_service._hard_delete_batch") as mock_hard_delete,
        ):
            mock_dt.now.return_value = now
            mock_crud.list_expired_top_folders.return_value = expired
            trash_service._purge_expired(db, user_id="u1")

        mock_crud.list_expired_top_folders.assert_called_once_with(db, user_id="u1", before=expected_cutoff)
        # Every expired batch goes through the same path as "Delete forever" (detach first).
        assert [c.kwargs["folder"] for c in mock_hard_delete.call_args_list] == expired
        mock_note_crud.purge_old_notes.assert_called_once_with(db, user_id="u1", before=expected_cutoff)
        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# P0-1: hard delete detaches other-batch items before the row is deleted
# ---------------------------------------------------------------------------


class TestHardDeleteFolderDetach:
    def test_detach_runs_before_crud_hard_delete_then_commit(self) -> None:
        """_detach_other_batches must run first so foreign-key CASCADE does not remove
        items that belong to a different trash batch inside the same subtree."""
        from app.services import trash_service

        db = MagicMock()
        folder = _make_folder("f1", deleted_at=_ts(1))
        call_order: list[str] = []
        db.commit.side_effect = lambda: call_order.append("commit")

        with (
            patch("app.services.trash_service._get_trashed_folder_or_404", return_value=folder),
            patch("app.services.trash_service.folder_crud") as mock_crud,
            patch(
                "app.services.trash_service._detach_other_batches",
                side_effect=lambda *a, **kw: call_order.append("detach"),
            ) as mock_detach,
        ):
            mock_crud.hard_delete.side_effect = lambda *a, **kw: call_order.append("delete")
            trash_service.hard_delete_folder(db, folder_id="f1", current_user=_make_user())

        assert call_order == ["detach", "delete", "commit"]
        mock_detach.assert_called_once_with(db, folder=folder)
        mock_crud.hard_delete.assert_called_once_with(db, folder=folder)


# ---------------------------------------------------------------------------
# empty_trash — two bulk deletes, notes first
# ---------------------------------------------------------------------------


class TestEmptyTrash:
    def test_bulk_deletes_notes_then_folders_and_commits_once(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        order: list[str] = []
        with (
            patch("app.services.trash_service.folder_crud") as mock_folder_crud,
            patch("app.services.trash_service.note_crud") as mock_note_crud,
        ):
            mock_note_crud.delete_all_trashed.side_effect = lambda *a, **kw: order.append("notes")
            mock_folder_crud.delete_all_trashed.side_effect = lambda *a, **kw: order.append("folders")
            trash_service.empty_trash(db, current_user=_make_user())

        assert order == ["notes", "folders"]
        mock_note_crud.delete_all_trashed.assert_called_once_with(db, user_id="u1")
        mock_folder_crud.delete_all_trashed.assert_called_once_with(db, user_id="u1")
        db.commit.assert_called_once()
        db.delete.assert_not_called()


# ---------------------------------------------------------------------------
# list_trash — folders are loaded once, not once per item
# ---------------------------------------------------------------------------


class TestListTrashPaths:
    def test_folder_map_loaded_once_for_all_items(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        parent = _make_folder("p", name="P", deleted_at=None)
        folders = {"p": parent}
        top_folders = [_make_folder(f"t{i}", parent_id="p", name=f"T{i}", deleted_at=_ts(i + 1)) for i in range(3)]
        notes = [_make_note(f"n{i}", folder_id="p", deleted_at=_ts(i + 5)) for i in range(3)]
        for n in notes:
            n.title = "Note"

        with (
            patch("app.services.trash_service._purge_expired"),
            patch("app.services.trash_service.folder_service.load_folder_map", return_value=folders) as mock_load,
            patch("app.services.trash_service.folder_crud") as mock_crud,
            patch("app.services.trash_service.note_crud") as mock_note_crud,
        ):
            mock_crud.list_trashed_top_folders.return_value = top_folders
            mock_note_crud.list_trashed_top_notes.return_value = notes
            mock_crud.count_batch_items.return_value = (0, 0)
            items = trash_service.list_trash(db, current_user=_make_user())

        mock_load.assert_called_once_with(db, user_id="u1", include_trashed=True)
        assert len(items) == 6
        assert {i.original_path for i in items} == {"/P"}

    def test_original_path_string_format(self) -> None:
        # `build_folder_path` returns names; the API still sends "/A/B", None for root, "/" for an unknown parent.
        from app.services import trash_service

        db = MagicMock()
        folders = {"p": _make_folder("p", name="P"), "a": _make_folder("a", parent_id="p", name="A/B")}
        notes = [
            _make_note("root", folder_id=None, deleted_at=_ts(1)),
            _make_note("nested", folder_id="a", deleted_at=_ts(2), orphan_path=["Lost"]),
            _make_note("unknown", folder_id="gone", deleted_at=_ts(3)),
        ]
        for n in notes:
            n.title = "Note"

        with (
            patch("app.services.trash_service._purge_expired"),
            patch("app.services.trash_service.folder_service.load_folder_map", return_value=folders),
            patch("app.services.trash_service.folder_crud") as mock_crud,
            patch("app.services.trash_service.note_crud") as mock_note_crud,
        ):
            mock_crud.list_trashed_top_folders.return_value = []
            mock_note_crud.list_trashed_top_notes.return_value = notes
            items = trash_service.list_trash(db, current_user=_make_user())

        assert {i.id: i.original_path for i in items} == {"root": None, "nested": "/P/A/B/Lost", "unknown": "/"}


# ---------------------------------------------------------------------------
# P1-2: FolderUpdate rejects explicit null name
# ---------------------------------------------------------------------------


class TestFolderUpdateSchema:
    def test_explicit_null_name_raises_422(self) -> None:
        """Sending name=null in a PATCH body must produce a validation error, not silently
        pass None to the CRUD layer where the column is NOT NULL."""
        import pydantic

        from app.schemas.folder import FolderUpdate

        with pytest.raises(pydantic.ValidationError):
            FolderUpdate.model_validate({"name": None})

    def test_omitting_name_is_fine(self) -> None:
        """Not sending name at all should leave it unset (default None = no-op in CRUD)."""
        from app.schemas.folder import FolderUpdate

        schema = FolderUpdate.model_validate({})
        assert "name" not in schema.model_fields_set


# ---------------------------------------------------------------------------
# P1-3: _resolve_restore_name truncates the base when it is too long
# ---------------------------------------------------------------------------


class TestRestoreNameTruncation:
    def test_long_name_candidate_fits_in_column_limit(self) -> None:
        """When the original name is 95 chars, the ' (restored)' suffix would exceed 100.
        The function must truncate the base so the final candidate stays within the limit."""
        from app.core.constants import FOLDER_NAME_MAX
        from app.services.trash_service import _resolve_restore_name

        long_name = "A" * 95  # 95 chars — original fits in column; suffixed version does not

        db = MagicMock()
        # First sibling_name_exists call (original name) → conflict.
        # Second call (truncated + ' (restored)') → no conflict.
        with patch("app.services.trash_service.folder_crud") as mock_crud:
            mock_crud.sibling_name_exists.side_effect = [True, False]
            result = _resolve_restore_name(db, name=long_name, parent_id=None, user_id="u1", exclude_id="f1")

        assert len(result) <= FOLDER_NAME_MAX, f"result length {len(result)} exceeds {FOLDER_NAME_MAX}"
        assert result.endswith(" (restored)")


# ---------------------------------------------------------------------------
# build_orphan_path — pure helper for trash_service._detach_other_batches
# ---------------------------------------------------------------------------


def _by_id(*folders: MagicMock) -> dict[str, MagicMock]:
    return {f.id: f for f in folders}


class TestBuildOrphanPath:
    @staticmethod
    def _folders() -> dict[str, MagicMock]:
        # top (A) -> B -> C; A is the hard-deleted folder.
        return _by_id(
            _make_folder("a", parent_id="outside", name="A"),
            _make_folder("b", parent_id="a", name="B"),
            _make_folder("c", parent_id="b", name="C"),
        )

    def test_path_from_top_to_item_parent(self) -> None:
        from app.services.folder_paths import build_orphan_path

        assert build_orphan_path(self._folders(), top_id="a", start_id="c", existing=None) == ["A", "B", "C"]

    def test_item_directly_in_top_folder(self) -> None:
        from app.services.folder_paths import build_orphan_path

        assert build_orphan_path(self._folders(), top_id="a", start_id="a", existing=None) == ["A"]

    def test_stops_at_top_folder(self) -> None:
        from app.services.folder_paths import build_orphan_path

        folders = self._folders()
        folders["a"].orphan_path = ["Z"]
        # B is the top: A (and its orphan_path) is above the batch, so it is not added.
        assert build_orphan_path(folders, top_id="b", start_id="c", existing=[]) == ["B", "C"]

    def test_existing_path_is_added_at_the_end(self) -> None:
        from app.services.folder_paths import build_orphan_path

        result = build_orphan_path(self._folders(), top_id="a", start_id="b", existing=["X", "Y"])
        assert result == ["A", "B", "X", "Y"]

    def test_orphan_path_of_top_comes_first(self) -> None:
        """The top folder lost its own parents in an earlier hard delete. Its orphan_path holds
        their names, so they must come before the name of the top."""
        from app.services.folder_paths import build_orphan_path

        folders = self._folders()
        folders["a"].orphan_path = ["X"]
        assert build_orphan_path(folders, top_id="a", start_id="c", existing=["Old"]) == ["X", "A", "B", "C", "Old"]

    def test_orphan_path_of_intermediate_folder_sits_above_it(self) -> None:
        # Same rule as build_folder_path: the orphan_path of B is between A and B.
        from app.services.folder_paths import build_orphan_path

        folders = self._folders()
        folders["b"].orphan_path = ["Y"]
        assert build_orphan_path(folders, top_id="a", start_id="c", existing=None) == ["A", "Y", "B", "C"]

    def test_repeated_hard_deletes_keep_outermost_first(self) -> None:
        """Delete inner folder first, then the outer one: the outer names must come first."""
        from app.services.folder_paths import build_orphan_path

        # First delete: folder "mid" (parent "out") is removed; item sat in "leaf" under "mid".
        mid = _make_folder("mid", parent_id="out", name="Mid")
        leaf = _make_folder("leaf", parent_id="mid", name="Leaf")
        first = build_orphan_path(_by_id(mid, leaf), top_id="mid", start_id="leaf", existing=None)
        assert first == ["Mid", "Leaf"]
        # Second delete: folder "out" is removed and the item now sits directly in it.
        second = build_orphan_path(
            _by_id(_make_folder("out", name="Out")), top_id="out", start_id="out", existing=first
        )
        assert second == ["Out", "Mid", "Leaf"]

    def test_cycle_does_not_loop_forever(self) -> None:
        from app.services.folder_paths import build_orphan_path

        cyclic = _by_id(_make_folder("x", parent_id="y", name="X"), _make_folder("y", parent_id="x", name="Y"))
        assert build_orphan_path(cyclic, top_id="zzz", start_id="x", existing=None) == ["Y", "X"]


def _run_detach(
    top: MagicMock,
    *,
    batch: list[MagicMock],
    child_folders: list[MagicMock] | None = None,
    notes: list[MagicMock] | None = None,
) -> tuple[MagicMock, MagicMock]:
    """Run trash_service._detach_other_batches; the CRUD reads return the given in-memory rows.

    Returns the (folder_crud, note_crud) mocks, so a test can check the query arguments.
    """
    from app.services import trash_service

    def _reparent_folder(_db: object, *, folder: MagicMock, parent_id: str | None, orphan_path: list[str]) -> None:
        folder.parent_id, folder.orphan_path = parent_id, orphan_path

    def _reparent_note(_db: object, *, note: MagicMock, folder_id: str | None, orphan_path: list[str]) -> None:
        note.folder_id, note.orphan_path = folder_id, orphan_path

    with (
        patch("app.services.trash_service.folder_crud") as mock_folder_crud,
        patch("app.services.trash_service.note_crud") as mock_note_crud,
    ):
        mock_folder_crud.list_batch_folders.return_value = batch
        mock_folder_crud.list_children_outside_batch.return_value = child_folders or []
        mock_note_crud.list_in_folders_outside_batch.return_value = notes or []
        mock_folder_crud.reparent.side_effect = _reparent_folder
        mock_note_crud.reparent.side_effect = _reparent_note
        trash_service._detach_other_batches(MagicMock(), folder=top)
    return mock_folder_crud, mock_note_crud


class TestDetachOtherBatches:
    def test_orphans_are_reparented_with_path(self) -> None:
        ts = _ts(1)
        top = _make_folder("a", parent_id="gp", name="A", deleted_at=ts)
        child_batch = _make_folder("b", parent_id="a", name="B", deleted_at=ts)
        other_note = _make_note("n1", folder_id="b", deleted_at=_ts(3), orphan_path=["Old"])
        other_folder = _make_folder("f9", parent_id="a", name="F9", deleted_at=_ts(4))

        mock_folder_crud, mock_note_crud = _run_detach(
            top, batch=[top, child_batch], child_folders=[other_folder], notes=[other_note]
        )

        # Only the direct children of batch folders that are NOT in the batch are moved.
        mock_folder_crud.list_children_outside_batch.assert_called_once_with(ANY, parent_ids=["a", "b"], batch_ts=ts)
        mock_note_crud.list_in_folders_outside_batch.assert_called_once_with(
            ANY, user_id="u1", folder_ids=["a", "b"], batch_ts=ts
        )
        # Items move to the parent of the deleted top folder.
        assert other_folder.parent_id == "gp"
        assert other_folder.orphan_path == ["A"]
        assert other_note.folder_id == "gp"
        assert other_note.orphan_path == ["A", "B", "Old"]

    def test_orphan_path_of_top_is_kept(self) -> None:
        """The top folder was detached before (orphan_path=["X"]). Its lost name X must stay in
        the path of the items that move out, or restore puts them in the wrong place."""
        top = _make_folder("f", parent_id="p", name="F", deleted_at=_ts(2), orphan_path=["X"])
        note = _make_note("n", folder_id="f", deleted_at=_ts(3))

        _run_detach(top, batch=[top], notes=[note])

        assert note.folder_id == "p"
        assert note.orphan_path == ["X", "F"]

    def test_orphan_path_of_intermediate_batch_folder_is_kept(self) -> None:
        ts = _ts(1)
        top = _make_folder("a", parent_id="gp", name="A", deleted_at=ts)
        mid = _make_folder("b", parent_id="a", name="B", deleted_at=ts, orphan_path=["Y"])
        note = _make_note("n", folder_id="b", deleted_at=_ts(3))

        _run_detach(top, batch=[top, mid], notes=[note])

        assert note.orphan_path == ["A", "Y", "B"]

    # P (live) > X > F > N. Trash N, then F, then X: three batches. Then delete X and F forever,
    # in both orders. N must end up in P with orphan_path [X, F], so restore rebuilds P/X/F.

    @staticmethod
    def _nested() -> tuple[MagicMock, MagicMock, MagicMock]:
        x = _make_folder("x", parent_id="p", name="X", deleted_at=_ts(1))
        f = _make_folder("f", parent_id="x", name="F", deleted_at=_ts(2))
        n = _make_note("n", folder_id="f", deleted_at=_ts(3))
        return x, f, n

    def test_nested_delete_outer_then_inner(self) -> None:
        x, f, n = self._nested()

        _run_detach(x, batch=[x], child_folders=[f])  # Delete X forever: F moves to P.
        assert (f.parent_id, f.orphan_path) == ("p", ["X"])

        _run_detach(f, batch=[f], notes=[n])  # Delete F forever: N moves to P.
        assert (n.folder_id, n.orphan_path) == ("p", ["X", "F"])

    def test_nested_delete_inner_then_outer(self) -> None:
        x, f, n = self._nested()

        _run_detach(f, batch=[f], notes=[n])  # Delete F forever: N moves to X.
        assert (n.folder_id, n.orphan_path) == ("x", ["F"])

        _run_detach(x, batch=[x], notes=[n])  # Delete X forever: N moves to P.
        assert (n.folder_id, n.orphan_path) == ("p", ["X", "F"])


# ---------------------------------------------------------------------------
# Restore path: trashed ancestors and orphan_path
# ---------------------------------------------------------------------------


class TestRestorePath:
    def test_note_restores_chain_of_trashed_ancestors_only_rows(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        user = _make_user()
        note = _make_note("n1", folder_id="p", deleted_at=_ts(1))
        live_root = _make_folder("live", deleted_at=None)
        top = _make_folder("g", parent_id="live", name="G", deleted_at=_ts(2))
        parent = _make_folder("p", parent_id="g", name="P", deleted_at=_ts(2))
        folders = {"p": parent, "g": top, "live": live_root}

        with (
            patch("app.services.trash_service._get_trashed_note_or_404", return_value=note),
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            mock_crud.get_by_id.side_effect = lambda _db, id: folders.get(id)
            mock_crud.sibling_name_exists.return_value = False
            _wire_restore(mock_crud)
            trash_service.restore_note(db, note_id="n1", current_user=user)

        assert top.deleted_at is None and parent.deleted_at is None
        assert top.parent_id == "live"
        assert parent.parent_id == "g"
        assert note.folder_id == "p" and note.deleted_at is None
        mock_crud.restore_folder_batch.assert_not_called()

    def test_topmost_ancestor_is_renamed_on_conflict(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        note = _make_note("n1", folder_id="p", deleted_at=_ts(1))
        parent = _make_folder("p", parent_id=None, name="P", deleted_at=_ts(2))

        with (
            patch("app.services.trash_service._get_trashed_note_or_404", return_value=note),
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            mock_crud.get_by_id.side_effect = lambda _db, id: {"p": parent}.get(id)
            mock_crud.sibling_name_exists.side_effect = [True, False]
            _wire_restore(mock_crud)
            trash_service.restore_note(db, note_id="n1", current_user=_make_user())

        assert parent.name == "P (restored)"

    def test_orphan_path_reuses_live_folder_and_creates_missing(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        note = _make_note("n1", folder_id=None, deleted_at=_ts(1), orphan_path=["A", "B"])
        live_a = _make_folder("live-a", name="a")
        created = _make_folder("new-b", name="B")

        with (
            patch("app.services.trash_service._get_trashed_note_or_404", return_value=note),
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            # "A" exists (different case), "B" does not.
            mock_crud.get_live_child_by_name.side_effect = [live_a, None]
            mock_crud.create.return_value = created
            _wire_restore(mock_crud)
            trash_service.restore_note(db, note_id="n1", current_user=_make_user())

        create_data = mock_crud.create.call_args.kwargs["data"]
        assert (create_data.name, create_data.parent_id) == ("B", "live-a")
        assert note.folder_id == "new-b"
        assert note.orphan_path is None
        assert note.deleted_at is None

    def test_folder_with_orphan_path_and_missing_parent_goes_under_recreated_path(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        folder = _make_folder("f1", parent_id=None, name="F", deleted_at=_ts(1), orphan_path=["X"])
        created = _make_folder("new-x", name="X")

        with (
            patch("app.services.trash_service._get_trashed_folder_or_404", return_value=folder),
            patch("app.services.trash_service.folder_crud") as mock_crud,
        ):
            mock_crud.get_live_child_by_name.return_value = None
            mock_crud.create.return_value = created
            mock_crud.sibling_name_exists.return_value = False
            _wire_restore(mock_crud)
            trash_service.restore_folder(db, folder_id="f1", current_user=_make_user())

        assert folder.parent_id == "new-x"
        assert folder.orphan_path is None
