"""Tests for the Folders feature.

Covers: cycle check, sibling uniqueness,
move_note version isolation, and ownership 404s.

Run:  pytest tests/test_folders.py
"""

from __future__ import annotations

from collections import namedtuple
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

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
                folder_service._assert_no_sibling_conflict(db, user_id="u1", parent_id=None, name="Duplicated")
        assert exc_info.value.status_code == 409
        assert "Duplicated" in exc_info.value.detail

    def test_no_conflict_does_not_raise(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.sibling_name_exists.return_value = False
            folder_service._assert_no_sibling_conflict(db, user_id="u1", parent_id=None, name="Unique")


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
            patch("app.services.note_service.get_live_note") as mock_get_note,
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
            patch("app.services.note_service.get_live_note") as mock_get_note,
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
    def testget_live_folder_or_404_raises_404_when_not_found(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u1")
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                folder_service.get_live_folder_or_404(db, folder_id="missing", current_user=user)
        assert exc_info.value.status_code == 404

    def testget_live_folder_or_404_raises_403_for_another_user(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u1")
        other_folder = _make_folder("f1", user_id="u2")
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = other_folder
            with pytest.raises(HTTPException) as exc_info:
                folder_service.get_live_folder_or_404(db, folder_id="f1", current_user=user)
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# folder_service.get_tree
# ---------------------------------------------------------------------------


# The CRUD returns SQLAlchemy Rows: tuples whose columns are also named attributes.
_FolderRow = namedtuple("_FolderRow", ["id", "name", "parent_id", "updated_at"])
_NoteRow = namedtuple("_NoteRow", ["id", "title", "folder_id", "updated_at", "is_favorite", "favorited_at"])


def _now() -> datetime:
    return datetime(2024, 1, 1, tzinfo=timezone.utc)


class TestGetTree:
    def test_returns_flat_folders_and_notes_for_all_depths(self) -> None:
        """Folders at any depth and notes in any folder appear in the flat lists."""
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u1")
        ts = _now()
        # folder "root" (no parent) and folder "child" (parent = "f1")
        folder_rows = [
            _FolderRow("f1", "Root", None, ts),
            _FolderRow("f2", "Child", "f1", ts),
        ]
        # note in root folder and note in child folder
        note_rows = [
            _NoteRow("n1", "Alpha", None, ts, False, None),
            _NoteRow("n2", "Beta", "f2", ts, False, None),
        ]
        with (
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service.note_crud") as mock_note_crud,
        ):
            mock_crud.list_tree_folders.return_value = folder_rows
            mock_note_crud.list_tree_notes.return_value = note_rows

            result = folder_service.get_tree(db, current_user=user)

        assert len(result.folders) == 2
        assert result.folders[0].id == "f1"
        assert result.folders[0].parent_id is None
        assert result.folders[1].id == "f2"
        assert result.folders[1].parent_id == "f1"
        assert len(result.notes) == 2
        assert result.notes[0].id == "n1"
        assert result.notes[0].folder_id is None
        assert result.notes[1].id == "n2"
        assert result.notes[1].folder_id == "f2"

    def test_note_items_have_no_content_key(self) -> None:
        """FileTreeNote must not expose a content field."""
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u1")
        ts = _now()
        note_rows = [_NoteRow("n1", "Title", None, ts, False, None)]
        with (
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service.note_crud") as mock_note_crud,
        ):
            mock_crud.list_tree_folders.return_value = []
            mock_note_crud.list_tree_notes.return_value = note_rows

            result = folder_service.get_tree(db, current_user=user)

        note_dict = result.notes[0].model_dump()
        assert "content" not in note_dict

    def test_excludes_trashed_items(self) -> None:
        """CRUD is called without trashed rows; get_tree passes them straight through."""
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u1")
        # The CRUD already filters deleted_at IS NULL; here it returns 0 live items.
        with (
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service.note_crud") as mock_note_crud,
        ):
            mock_crud.list_tree_folders.return_value = []
            mock_note_crud.list_tree_notes.return_value = []

            result = folder_service.get_tree(db, current_user=user)

        assert result.folders == []
        assert result.notes == []
        mock_crud.list_tree_folders.assert_called_once_with(db, user_id="u1")
        mock_note_crud.list_tree_notes.assert_called_once_with(db, user_id="u1")

    def test_excludes_other_user_items(self) -> None:
        """CRUD is called with current_user.id — other-user items are never fetched."""
        from app.services import folder_service

        db = MagicMock()
        user = _make_user("u_mine")
        ts = _now()
        with (
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service.note_crud") as mock_note_crud,
        ):
            mock_crud.list_tree_folders.return_value = [_FolderRow("f1", "Mine", None, ts)]
            mock_note_crud.list_tree_notes.return_value = []

            folder_service.get_tree(db, current_user=user)

        # Confirm user_id passed to CRUD matches the authenticated user
        mock_crud.list_tree_folders.assert_called_once_with(db, user_id="u_mine")
        mock_note_crud.list_tree_notes.assert_called_once_with(db, user_id="u_mine")


# ---------------------------------------------------------------------------
# Batch 5: name strip, NoteMove required field, IntegrityError to 409, row locks
# ---------------------------------------------------------------------------


class TestFolderNameSchema:
    def test_create_strips_whitespace(self) -> None:
        from app.schemas.folder import FolderCreate

        assert FolderCreate.model_validate({"name": "  Math  "}).name == "Math"

    def test_update_strips_whitespace(self) -> None:
        from app.schemas.folder import FolderUpdate

        assert FolderUpdate.model_validate({"name": " Math "}).name == "Math"

    @pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
    def test_create_rejects_empty_result(self, blank: str) -> None:
        import pydantic

        from app.schemas.folder import FolderCreate

        with pytest.raises(pydantic.ValidationError):
            FolderCreate.model_validate({"name": blank})

    def test_update_rejects_empty_result(self) -> None:
        import pydantic

        from app.schemas.folder import FolderUpdate

        with pytest.raises(pydantic.ValidationError):
            FolderUpdate.model_validate({"name": "   "})

    def test_update_still_rejects_null(self) -> None:
        import pydantic

        from app.schemas.folder import FolderUpdate

        with pytest.raises(pydantic.ValidationError):
            FolderUpdate.model_validate({"name": None})


class TestNoteMoveSchema:
    def test_empty_body_is_rejected(self) -> None:
        import pydantic

        from app.schemas.note import NoteMove

        with pytest.raises(pydantic.ValidationError):
            NoteMove.model_validate({})

    def test_explicit_null_moves_to_root(self) -> None:
        from app.schemas.note import NoteMove

        assert NoteMove.model_validate({"folderId": None}).folder_id is None

    def test_folder_id_is_accepted(self) -> None:
        from app.schemas.note import NoteMove

        assert NoteMove.model_validate({"folderId": "f1"}).folder_id == "f1"


def _integrity_error(message: str) -> Exception:
    from sqlalchemy.exc import IntegrityError

    return IntegrityError("INSERT ...", {}, Exception(message))


class TestSiblingConflictGuard:
    def test_sibling_index_violation_becomes_409_and_rolls_back(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        error = _integrity_error('duplicate key value violates unique constraint "ix_folder_sibling_name"')
        with (
            pytest.raises(HTTPException) as exc_info,
            folder_service.sibling_conflict_as_409(db, name="Math", parent_id=None),
        ):
            raise error
        assert exc_info.value.status_code == 409
        # Same text as the pre-check.
        assert exc_info.value.detail == "A folder named 'Math' already exists in the root"
        db.rollback.assert_called_once()

    def test_other_integrity_error_is_reraised(self) -> None:
        from sqlalchemy.exc import IntegrityError

        from app.services import folder_service

        db = MagicMock()
        error = _integrity_error('insert violates foreign key constraint "folder_user_id_fkey"')
        with (
            pytest.raises(IntegrityError),
            folder_service.sibling_conflict_as_409(db, name="Math", parent_id="p1"),
        ):
            raise error
        db.rollback.assert_not_called()

    def test_create_folder_race_returns_409(self) -> None:
        """The pre-check passes, but the commit hits the unique index."""
        from app.schemas.folder import FolderCreate
        from app.services import folder_service

        db = MagicMock()
        db.commit.side_effect = _integrity_error('unique constraint "ix_folder_sibling_name"')
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.sibling_name_exists.return_value = False
            with pytest.raises(HTTPException) as exc_info:
                folder_service.create_folder(db, current_user=_make_user(), data=FolderCreate(name="Math"))
        assert exc_info.value.status_code == 409
        db.rollback.assert_called_once()

    def test_restore_race_returns_409(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        db.commit.side_effect = _integrity_error('unique constraint "ix_folder_sibling_name"')
        folder = _make_folder("f1", parent_id=None, name="Math")
        with (
            patch("app.services.trash_service._get_trashed_folder_or_404", return_value=folder),
            patch("app.services.trash_service._restore_location", return_value=None),
            patch("app.services.trash_service._resolve_restore_name", return_value="Math"),
            patch("app.services.trash_service.folder_crud"),
            pytest.raises(HTTPException) as exc_info,
        ):
            trash_service.restore_folder(db, folder_id="f1", current_user=_make_user())
        assert exc_info.value.status_code == 409


def _ordered(**mocks: MagicMock) -> MagicMock:
    """Attach the mocks to one parent, so `parent.mock_calls` shows the call order across them."""
    parent = MagicMock()
    for name, mock in mocks.items():
        parent.attach_mock(mock, name)
    return parent


def _call_names(parent: MagicMock) -> list[str]:
    # Direct calls only ("folder_crud.update"), not calls on their return values.
    return [name for name, _args, _kwargs in parent.mock_calls if "()" not in name]


def _trashed_folder(id: str) -> MagicMock:
    f = _make_folder(id)
    f.deleted_at = datetime.now(timezone.utc)
    f.orphan_path = None
    return f


class TestTreeLock:
    """Every tree write takes the per-user tree lock before it reads anything to decide."""

    def test_lock_tree_flushes_then_locks_then_expires(self) -> None:
        from sqlalchemy.dialects import postgresql

        from app.crud import folder as folder_crud

        db = MagicMock()
        folder_crud.lock_tree(db, user_id="u1")

        assert [name for name, _args, _kwargs in db.mock_calls] == ["flush", "execute", "expire_all"]
        stmt = db.execute.call_args.args[0]
        sql = str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        assert "pg_advisory_xact_lock(hashtext('tree:u1'))" in sql

    def test_folder_move(self) -> None:
        from app.schemas.folder import FolderUpdate
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.side_effect = [_make_folder("f1"), _make_folder("f2")]
            mock_crud.get_descendant_ids.return_value = []
            mock_crud.sibling_name_exists.return_value = False
            order = _ordered(folder_crud=mock_crud, db=db)
            folder_service.update_folder(
                db, folder_id="f1", current_user=_make_user(), data=FolderUpdate(parent_id="f2")
            )

        names = _call_names(order)
        assert names[0] == "folder_crud.lock_tree"
        assert names.index("folder_crud.update") < names.index("db.commit")
        mock_crud.lock_tree.assert_called_once_with(db, user_id="u1")

    def test_folder_delete(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with patch("app.services.folder_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = _make_folder("f1")
            mock_crud.count_live_descendants.return_value = (0, 2)
            order = _ordered(folder_crud=mock_crud, db=db)
            result = folder_service.delete_folder(db, folder_id="f1", current_user=_make_user())

        assert _call_names(order) == [
            "folder_crud.lock_tree",
            "folder_crud.get_by_id",
            "folder_crud.count_live_descendants",
            "folder_crud.soft_delete_cascade",
            "db.commit",
        ]
        assert result.outcome == "trashed"

    def test_empty_folder_delete_detaches_then_hard_deletes(self) -> None:
        from app.services import folder_service

        db = MagicMock()
        with (
            patch("app.services.folder_service.folder_crud") as mock_crud,
            patch("app.services.folder_service.note_crud"),
        ):
            mock_crud.get_by_id.return_value = _make_folder("f1")
            mock_crud.count_live_descendants.return_value = (0, 0)
            mock_crud.list_batch_folders.return_value = []
            mock_crud.list_children_outside_batch.return_value = []
            order = _ordered(folder_crud=mock_crud, db=db)
            result = folder_service.delete_folder(db, folder_id="f1", current_user=_make_user())

        names = _call_names(order)
        assert names[0] == "folder_crud.lock_tree"
        assert names.index("folder_crud.list_children_outside_batch") < names.index("folder_crud.hard_delete")
        assert names.index("folder_crud.hard_delete") < names.index("db.commit")
        assert "folder_crud.soft_delete_cascade" not in names
        assert result.outcome == "deleted"

    def test_folder_restore(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        with patch("app.services.trash_service.folder_crud") as mock_crud:
            mock_crud.get_by_id.return_value = _trashed_folder("f1")
            mock_crud.sibling_name_exists.return_value = False
            order = _ordered(folder_crud=mock_crud, db=db)
            trash_service.restore_folder(db, folder_id="f1", current_user=_make_user())

        names = _call_names(order)
        assert names[0] == "folder_crud.lock_tree"
        assert names.index("folder_crud.get_by_id") < names.index("folder_crud.relocate")
        assert names.index("folder_crud.restore_folder_batch") < names.index("db.commit")

    def test_note_restore(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        note = _make_note("n1")
        note.deleted_at = datetime.now(timezone.utc)
        note.orphan_path = None
        with (
            patch("app.services.trash_service.folder_crud") as mock_folder_crud,
            patch("app.services.trash_service.note_crud") as mock_note_crud,
        ):
            mock_note_crud.get_by_id.return_value = note
            order = _ordered(folder_crud=mock_folder_crud, note_crud=mock_note_crud, db=db)
            trash_service.restore_note(db, note_id="n1", current_user=_make_user())

        assert _call_names(order) == [
            "folder_crud.lock_tree",
            "note_crud.get_by_id",
            "note_crud.restore",
            "db.commit",
        ]

    def test_empty_trash(self) -> None:
        from app.services import trash_service

        db = MagicMock()
        with (
            patch("app.services.trash_service.folder_crud") as mock_folder_crud,
            patch("app.services.trash_service.note_crud") as mock_note_crud,
        ):
            order = _ordered(folder_crud=mock_folder_crud, note_crud=mock_note_crud, db=db)
            trash_service.empty_trash(db, current_user=_make_user())

        assert _call_names(order) == [
            "folder_crud.lock_tree",
            "note_crud.delete_all_trashed",
            "folder_crud.delete_all_trashed",
            "db.commit",
        ]

    def test_note_move(self) -> None:
        from app.services import note_service

        db = MagicMock()
        with (
            patch("app.services.note_service.folder_crud") as mock_folder_crud,
            patch("app.services.note_service.note_crud") as mock_note_crud,
            patch("app.services.note_service.get_live_folder_or_404") as mock_get_folder,
        ):
            mock_note_crud.get_by_id.return_value = _make_note("n1")
            order = _ordered(folder_crud=mock_folder_crud, note_crud=mock_note_crud, get_folder=mock_get_folder, db=db)
            note_service.move_note(db, note_id="n1", current_user=_make_user(), folder_id="f2")

        assert _call_names(order) == [
            "folder_crud.lock_tree",
            "note_crud.get_by_id",
            "get_folder",
            "note_crud.move",
            "db.commit",
            "db.refresh",
        ]

    def test_generate_note_locks_after_the_ai_call(self) -> None:
        """The AI call is slow, so the lock comes after it. The folder is checked again under the lock."""
        from app.schemas.note import NoteGenerate
        from app.services import note_service

        db = MagicMock()
        with (
            patch("app.services.note_service.folder_crud") as mock_folder_crud,
            patch("app.services.note_service.note_crud") as mock_note_crud,
            patch("app.services.note_service.get_live_folder_or_404") as mock_get_folder,
            patch("app.services.note_service.complete_for_user") as mock_llm,
            patch("app.services.note_service.token_usage_service"),
        ):
            order = _ordered(
                folder_crud=mock_folder_crud,
                note_crud=mock_note_crud,
                get_folder=mock_get_folder,
                llm=mock_llm,
                db=db,
            )
            note_service.generate_note(db, current_user=_make_user(), data=NoteGenerate(topic="T", folder_id="f1"))

        assert _call_names(order) == [
            "get_folder",
            "llm",
            "folder_crud.lock_tree",
            "get_folder",
            "note_crud.create",
            "db.commit",
            "db.refresh",
        ]
