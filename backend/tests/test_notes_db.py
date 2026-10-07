"""Note favorites and content search on the real Postgres DB.

Run with `pytest --run-db tests/test_notes_db.py` (`make test-db`). Each test runs inside one
transaction that is rolled back (see the `db_session` fixture in `conftest.py`).
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session
from ulid import ULID

from app.models.folder import Folder
from app.models.note import Note
from app.models.user import User
from app.schemas.folder import FolderCreate
from app.schemas.note import NoteCreate, NoteUpdate
from app.services import folder_service, note_service

pytestmark = pytest.mark.db


@pytest.fixture
def user(db_session: Session) -> User:
    tag = str(ULID()).lower()
    new_user = User(username=f"dbtest-{tag}", email=f"dbtest-{tag}@example.com", hashed_password="x")
    db_session.add(new_user)
    db_session.flush()
    return new_user


def _folder(db: Session, user: User, name: str, parent: Folder | None = None) -> Folder:
    data = FolderCreate(name=name, parent_id=parent.id if parent else None)
    return folder_service.create_folder(db, current_user=user, data=data)


def _note(db: Session, user: User, title: str, content: str = "", folder: Folder | None = None) -> Note:
    data = NoteCreate(title=title, content=content, folder_id=folder.id if folder else None)
    return note_service.create_note(db, current_user=user, data=data)


class TestFavorite:
    def test_star_sets_time_and_unstar_clears_it(self, db_session: Session, user: User) -> None:
        note = _note(db_session, user, "N")

        starred = note_service.set_favorite(db_session, note_id=note.id, current_user=user, is_favorite=True)
        assert starred.is_favorite is True
        assert starred.favorited_at is not None

        unstarred = note_service.set_favorite(db_session, note_id=note.id, current_user=user, is_favorite=False)
        assert unstarred.is_favorite is False
        assert unstarred.favorited_at is None

    def test_star_keeps_version_and_updated_at(self, db_session: Session, user: User) -> None:
        note = _note(db_session, user, "N")
        # Make `updated_at` old, so a bump to now() would be visible.
        old = datetime.now(timezone.utc) - timedelta(days=3)
        db_session.execute(sql_update(Note).where(Note.id == note.id).values(updated_at=old))
        db_session.expire_all()

        starred = note_service.set_favorite(db_session, note_id=note.id, current_user=user, is_favorite=True)

        assert starred.version == 1
        assert starred.updated_at == old
        # The editor still saves with the version it loaded: no conflict.
        note_service.update_note(db_session, note_id=note.id, current_user=user, data=NoteUpdate(title="N2", version=1))

    def test_starred_note_is_in_the_file_tree(self, db_session: Session, user: User) -> None:
        note = _note(db_session, user, "N")
        note_service.set_favorite(db_session, note_id=note.id, current_user=user, is_favorite=True)

        tree = folder_service.get_tree(db_session, current_user=user)

        (node,) = tree.notes
        assert node.is_favorite is True
        assert node.favorited_at is not None

    def test_trashed_note_cannot_be_starred(self, db_session: Session, user: User) -> None:
        note = _note(db_session, user, "N")
        note_service.delete_note(db_session, note_id=note.id, current_user=user)

        with pytest.raises(HTTPException) as exc_info:
            note_service.set_favorite(db_session, note_id=note.id, current_user=user, is_favorite=True)

        assert exc_info.value.status_code == 409


class TestContentSearch:
    def test_finds_live_notes_by_content_ignoring_case(self, db_session: Session, user: User) -> None:
        _note(db_session, user, "B", "The Mitochondria makes energy")
        _note(db_session, user, "A", "mitochondria again")
        _note(db_session, user, "C", "nothing here")

        matches = note_service.search_notes_content(db_session, current_user=user, query="MITOCHONDRIA")

        assert [m.title for m in matches] == ["A", "B"]

    def test_folder_limits_the_search_to_its_subtree(self, db_session: Session, user: User) -> None:
        top = _folder(db_session, user, "Top")
        sub = _folder(db_session, user, "Sub", top)
        other = _folder(db_session, user, "Other")
        _note(db_session, user, "in-top", "needle", top)
        _note(db_session, user, "in-sub", "needle", sub)
        _note(db_session, user, "in-other", "needle", other)
        _note(db_session, user, "at-root", "needle")

        matches = note_service.search_notes_content(db_session, current_user=user, query="needle", folder_id=top.id)

        assert [m.title for m in matches] == ["in-sub", "in-top"]

    def test_trashed_and_foreign_notes_are_not_found(self, db_session: Session, user: User) -> None:
        tag = str(ULID()).lower()
        stranger = User(username=f"other-{tag}", email=f"other-{tag}@example.com", hashed_password="x")
        db_session.add(stranger)
        db_session.flush()
        trashed = _note(db_session, user, "trashed", "needle")
        _note(db_session, stranger, "foreign", "needle")
        note_service.delete_note(db_session, note_id=trashed.id, current_user=user)

        assert note_service.search_notes_content(db_session, current_user=user, query="needle") == []

    def test_wildcard_characters_are_literal(self, db_session: Session, user: User) -> None:
        _note(db_session, user, "plain", "100 apples")
        _note(db_session, user, "literal", "100% sure")

        matches = note_service.search_notes_content(db_session, current_user=user, query="100%")

        assert [m.title for m in matches] == ["literal"]

    def test_result_has_a_snippet_around_the_hit(self, db_session: Session, user: User) -> None:
        content = "a" * 100 + " needle " + "b" * 100
        _note(db_session, user, "N", content)

        (match,) = note_service.search_notes_content(db_session, current_user=user, query="needle")

        assert "needle" in match.snippet
        assert match.snippet.startswith("…") and match.snippet.endswith("…")
