"""Folder and trash assistant tools on the real Postgres DB (real services, tree lock, cycle check).

Each test runs inside one transaction that is rolled back (see the `db_session` fixture).
Run with `pytest --run-db tests/test_assist_tools_db.py` (`make test-db`).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from ulid import ULID

from app.models.folder import Folder
from app.models.note import Note
from app.models.user import User
from app.schemas.folder import FolderCreate
from app.schemas.note import NoteCreate
from app.services import folder_service, note_service
from app.services.assist_tools import execute_tool

pytestmark = pytest.mark.db


def _new_user(db: Session) -> User:
    tag = str(ULID()).lower()
    user = User(username=f"dbtest-{tag}", email=f"dbtest-{tag}@example.com", hashed_password="x")
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def user(db_session: Session) -> User:
    return _new_user(db_session)


def _folder(db: Session, user: User, name: str, parent: Folder | None = None) -> Folder:
    return folder_service.create_folder(
        db, current_user=user, data=FolderCreate(name=name, parent_id=parent.id if parent else None)
    )


def _note(db: Session, user: User, title: str, folder: Folder | None = None) -> Note:
    return note_service.create_note(
        db, current_user=user, data=NoteCreate(title=title, folder_id=folder.id if folder else None)
    )


def _by_name(db: Session, user: User, name: str) -> Folder:
    return db.scalars(select(Folder).where(Folder.user_id == user.id, Folder.name == name)).one()


def _run(db: Session, user: User, tool: str, **arguments: object) -> str:
    return execute_tool(db, current_user=user, tool_name=tool, arguments=dict(arguments)).output


class TestCreateFolderTool:
    def test_creates_a_folder_under_a_parent(self, db_session: Session, user: User) -> None:
        parent = _folder(db_session, user, "Science")
        output = _run(db_session, user, "create_folder", name="Biology", parent_id=parent.id)

        assert "Files > Science" in output
        created = _by_name(db_session, user, "Biology")
        assert created.parent_id == parent.id

    def test_same_name_in_the_same_place_is_a_readable_error(self, db_session: Session, user: User) -> None:
        _folder(db_session, user, "Biology")
        output = _run(db_session, user, "create_folder", name="Biology")
        assert output.startswith("Error: A folder named 'Biology' already exists in the root")

    def test_parent_of_another_user_is_refused(self, db_session: Session, user: User) -> None:
        foreign = _folder(db_session, _new_user(db_session), "Theirs")
        assert _run(db_session, user, "create_folder", name="X", parent_id=foreign.id) == "Error: Access denied"


class TestMoveItemsTool:
    def test_moves_notes_into_a_new_folder(self, db_session: Session, user: User) -> None:
        notes = [_note(db_session, user, "A"), _note(db_session, user, "B")]
        _run(db_session, user, "create_folder", name="Target")
        target = _by_name(db_session, user, "Target")

        output = _run(db_session, user, "move_items", note_ids=[n.id for n in notes], target_folder_id=target.id)

        assert output == "Moved 2 notes and 0 folders to Files > Target."
        db_session.expire_all()
        assert {n.folder_id for n in notes} == {target.id}

    def test_note_of_another_user_is_skipped_not_moved(self, db_session: Session, user: User) -> None:
        mine = _note(db_session, user, "Mine")
        foreign = _note(db_session, _new_user(db_session), "Theirs")
        target = _folder(db_session, user, "Target")

        output = _run(db_session, user, "move_items", note_ids=[mine.id, foreign.id], target_folder_id=target.id)

        assert output.splitlines()[0] == "Moved 1 note and 0 folders to Files > Target."
        assert f"- note `{foreign.id}`: Access denied" in output
        db_session.expire_all()
        assert (mine.folder_id, foreign.folder_id) == (target.id, None)

    def test_folder_cannot_move_into_its_own_subfolder(self, db_session: Session, user: User) -> None:
        parent = _folder(db_session, user, "P")
        child = _folder(db_session, user, "C", parent)

        output = _run(db_session, user, "move_items", folder_ids=[parent.id], target_folder_id=child.id)

        assert output.splitlines()[0] == "No items were moved."
        assert "cannot be moved into one of its own descendants" in output

    def test_folder_moves_to_the_root_with_null(self, db_session: Session, user: User) -> None:
        parent = _folder(db_session, user, "P")
        child = _folder(db_session, user, "C", parent)

        output = _run(db_session, user, "move_items", folder_ids=[child.id], target_folder_id=None)

        assert output == "Moved 0 notes and 1 folder to Files."
        db_session.expire_all()
        assert child.parent_id is None

    def test_target_of_another_user_fails_the_call(self, db_session: Session, user: User) -> None:
        note = _note(db_session, user, "Mine")
        foreign = _folder(db_session, _new_user(db_session), "Theirs")

        assert _run(db_session, user, "move_items", note_ids=[note.id], target_folder_id=foreign.id) == (
            "Error: Access denied"
        )
        db_session.expire_all()
        assert note.folder_id is None


class TestTrashTools:
    def test_list_and_restore_a_trashed_note(self, db_session: Session, user: User) -> None:
        folder = _folder(db_session, user, "Bio")
        note = _note(db_session, user, "Mitosis", folder)
        note_service.delete_note(db_session, note_id=note.id, current_user=user)

        listing = _run(db_session, user, "list_trash")
        assert f"note **Mitosis** (ID: `{note.id}`, was in: Files > Bio" in listing

        output = _run(db_session, user, "restore_from_trash", items=[{"kind": "note", "id": note.id}])

        assert output == f"Restored 1 of 1 item(s): note `{note.id}`."
        db_session.expire_all()
        assert note.deleted_at is None and note.folder_id == folder.id
        assert _run(db_session, user, "list_trash") == "The Trash is empty."

    def test_note_of_another_user_is_not_restored(self, db_session: Session, user: User) -> None:
        other = _new_user(db_session)
        note = _note(db_session, other, "Theirs")
        note_service.delete_note(db_session, note_id=note.id, current_user=other)

        output = _run(db_session, user, "restore_from_trash", items=[{"kind": "note", "id": note.id}])

        assert f"- note `{note.id}`:" in output and output.startswith("No items were restored.")
        db_session.expire_all()
        assert note.deleted_at is not None

    def test_unknown_id_is_skipped(self, db_session: Session, user: User) -> None:
        output = _run(db_session, user, "restore_from_trash", items=[{"kind": "folder", "id": "nope"}])
        assert output.startswith("No items were restored.")
