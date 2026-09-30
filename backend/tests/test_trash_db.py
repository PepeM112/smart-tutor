"""Trash flows on the real Postgres DB (FK CASCADE, recursive CTEs, advisory lock, JSONB).

The other trash tests use mocks, so they do not run the SQL. These tests do. Each test runs
inside one transaction that is rolled back (see the `db_session` fixture in `conftest.py`).
Run with `pytest --run-db tests/test_trash_db.py` (`make test-db`).
"""

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import TypeVar

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session
from ulid import ULID

from app.core.constants import TRASH_RETENTION_DAYS
from app.models.folder import Folder
from app.models.note import Note
from app.models.user import User
from app.schemas.folder import FolderCreate
from app.schemas.note import NoteCreate
from app.services import folder_service, note_service, trash_service

pytestmark = pytest.mark.db

_Row = TypeVar("_Row", Folder, Note)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _note(db: Session, user: User, title: str, folder: Folder | None = None) -> Note:
    data = NoteCreate(title=title, folder_id=folder.id if folder else None)
    return note_service.create_note(db, current_user=user, data=data)


def _trash_folder(db: Session, user: User, folder: Folder) -> None:
    folder_service.delete_folder(db, folder_id=folder.id, current_user=user)


def _trash_note(db: Session, user: User, note: Note) -> None:
    note_service.delete_note(db, note_id=note.id, current_user=user)


def _reload(db: Session, model: type[_Row], id: str) -> _Row | None:
    """Read the row again from the DB (bulk UPDATE/DELETE do not change loaded objects)."""
    db.expire_all()
    return db.get(model, id)


def _live_path(db: Session, folder_id: str | None) -> list[str]:
    """Names from the root to `folder_id`. Every folder on the way must be live."""
    if folder_id is None:
        return []
    folder = db.get(Folder, folder_id)
    assert folder is not None and folder.deleted_at is None
    return [*_live_path(db, folder.parent_id), folder.name]


def _age(db: Session, model: type[Folder] | type[Note], ids: list[str], days: int) -> None:
    """Move `deleted_at` of these rows `days` into the past (one batch keeps one timestamp)."""
    old = datetime.now(timezone.utc) - timedelta(days=days)
    db.execute(sql_update(model).where(model.id.in_(ids)).values(deleted_at=old))
    db.flush()


def _count(db: Session, model: type[Folder] | type[Note], user: User) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.user_id == user.id)) or 0


# ---------------------------------------------------------------------------
# Delete forever, then restore
# ---------------------------------------------------------------------------


class TestRestoreAfterDeleteForever:
    def test_note_comes_back_to_recreated_parent(self, db_session: Session, user: User) -> None:
        p = _folder(db_session, user, "P")
        x = _folder(db_session, user, "X", p)
        n = _note(db_session, user, "N", x)
        _trash_note(db_session, user, n)
        _trash_folder(db_session, user, x)

        trash_service.hard_delete_folder(db_session, folder_id=x.id, current_user=user)

        assert _reload(db_session, Folder, x.id) is None
        detached = _reload(db_session, Note, n.id)
        assert detached is not None
        assert (detached.folder_id, detached.orphan_path) == (p.id, ["X"])

        trash_service.restore_note(db_session, note_id=n.id, current_user=user)

        restored = _reload(db_session, Note, n.id)
        assert restored is not None
        assert restored.deleted_at is None and restored.orphan_path is None
        assert _live_path(db_session, restored.folder_id) == ["P", "X"]

    def test_nested_deletes_keep_every_lost_name(self, db_session: Session, user: User) -> None:
        # P > X > F > N. Three batches: N, then F, then X. Delete X forever, then F.
        p = _folder(db_session, user, "P")
        x = _folder(db_session, user, "X", p)
        f = _folder(db_session, user, "F", x)
        n = _note(db_session, user, "N", f)
        _trash_note(db_session, user, n)
        _trash_folder(db_session, user, f)
        _trash_folder(db_session, user, x)

        trash_service.hard_delete_folder(db_session, folder_id=x.id, current_user=user)
        moved_f = _reload(db_session, Folder, f.id)
        assert moved_f is not None
        assert (moved_f.parent_id, moved_f.orphan_path) == (p.id, ["X"])

        trash_service.hard_delete_folder(db_session, folder_id=f.id, current_user=user)
        moved_n = _reload(db_session, Note, n.id)
        assert moved_n is not None
        assert (moved_n.folder_id, moved_n.orphan_path) == (p.id, ["X", "F"])

        trash_service.restore_note(db_session, note_id=n.id, current_user=user)

        restored = _reload(db_session, Note, n.id)
        assert restored is not None and restored.deleted_at is None
        assert _live_path(db_session, restored.folder_id) == ["P", "X", "F"]

    def test_restore_reuses_live_folder_with_same_name(self, db_session: Session, user: User) -> None:
        p = _folder(db_session, user, "P")
        x = _folder(db_session, user, "X", p)
        n = _note(db_session, user, "N", x)
        _trash_note(db_session, user, n)
        _trash_folder(db_session, user, x)
        trash_service.hard_delete_folder(db_session, folder_id=x.id, current_user=user)
        new_x = _folder(db_session, user, "x", p)  # Same name, other case.

        trash_service.restore_note(db_session, note_id=n.id, current_user=user)

        restored = _reload(db_session, Note, n.id)
        assert restored is not None and restored.folder_id == new_x.id


# ---------------------------------------------------------------------------
# Empty trash
# ---------------------------------------------------------------------------


class TestEmptyTrash:
    def test_nested_batches_go_and_live_items_stay(self, db_session: Session, user: User) -> None:
        p = _folder(db_session, user, "P")
        a = _folder(db_session, user, "A", p)
        b = _folder(db_session, user, "B", a)
        in_b = _note(db_session, user, "in B", b)
        in_a = _note(db_session, user, "in A", a)
        live_folder = _folder(db_session, user, "Live", p)
        live_notes = [
            _note(db_session, user, "in P", p),
            _note(db_session, user, "in Live", live_folder),
            _note(db_session, user, "root"),
        ]
        # Three batches, one inside the other.
        _trash_note(db_session, user, in_b)
        _trash_folder(db_session, user, b)
        _trash_folder(db_session, user, a)
        # Keep the ids: the objects expire, and a deleted row can not be loaded again.
        folder_ids, note_ids = [a.id, b.id], [in_a.id, in_b.id]

        trash_service.empty_trash(db_session, current_user=user)

        assert [_reload(db_session, Folder, i) for i in folder_ids] == [None, None]
        assert [_reload(db_session, Note, i) for i in note_ids] == [None, None]
        assert _count(db_session, Folder, user) == 2  # P, Live
        assert _count(db_session, Note, user) == len(live_notes)
        assert trash_service.list_trash(db_session, current_user=user) == []


# ---------------------------------------------------------------------------
# 30-day purge
# ---------------------------------------------------------------------------


class TestPurge:
    def test_nested_expired_batches_are_purged(self, db_session: Session, user: User) -> None:
        p = _folder(db_session, user, "P")
        x = _folder(db_session, user, "X", p)
        f = _folder(db_session, user, "F", x)
        n = _note(db_session, user, "N", f)
        _trash_note(db_session, user, n)
        _trash_folder(db_session, user, x)  # X and F: one batch.
        _age(db_session, Note, [n.id], TRASH_RETENTION_DAYS + 10)
        folder_ids, note_id = [x.id, f.id], n.id
        _age(db_session, Folder, folder_ids, TRASH_RETENTION_DAYS + 5)

        items = trash_service.list_trash(db_session, current_user=user)

        assert items == []
        assert [_reload(db_session, Folder, i) for i in folder_ids] == [None, None]
        assert _reload(db_session, Note, note_id) is None
        assert _count(db_session, Folder, user) == 1  # P

    def test_recent_batch_inside_expired_batch_survives(self, db_session: Session, user: User) -> None:
        p = _folder(db_session, user, "P")
        y = _folder(db_session, user, "Y", p)
        m = _note(db_session, user, "M", y)
        _trash_note(db_session, user, m)  # Recent.
        _trash_folder(db_session, user, y)
        y_id, m_id, p_id = y.id, m.id, p.id
        _age(db_session, Folder, [y_id], TRASH_RETENTION_DAYS + 1)

        items = trash_service.list_trash(db_session, current_user=user)

        assert _reload(db_session, Folder, y_id) is None
        survivor = _reload(db_session, Note, m_id)
        assert survivor is not None and survivor.deleted_at is not None
        assert (survivor.folder_id, survivor.orphan_path) == (p_id, ["Y"])
        assert [(i.kind, i.id, i.original_path) for i in items] == [("note", m_id, "/P/Y")]


# ---------------------------------------------------------------------------
# Restore of a non-top item, through the API
# ---------------------------------------------------------------------------


@pytest.fixture
def client(db_session: Session, user: User) -> Iterator[TestClient]:
    from app.database import get_session
    from app.dependencies.auth import get_current_user
    from app.main import app

    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestRestoreNonTopViaApi:
    def test_sub_folder_restore_brings_back_ancestor_row_only(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        # P > A > B > (note in B); A also has a note. One batch: trash A.
        p = _folder(db_session, user, "P")
        a = _folder(db_session, user, "A", p)
        b = _folder(db_session, user, "B", a)
        in_b = _note(db_session, user, "in B", b)
        in_a = _note(db_session, user, "in A", a)
        _trash_folder(db_session, user, a)

        response = client.post(f"/api/v1/trash/folder/{b.id}/restore")

        assert response.status_code == 204
        restored_b = _reload(db_session, Folder, b.id)
        assert restored_b is not None
        assert _live_path(db_session, restored_b.id) == ["P", "A", "B"]
        note_b = _reload(db_session, Note, in_b.id)
        assert note_b is not None and note_b.deleted_at is None
        # A comes back as a row only: its other content stays in Trash, as a top item now.
        note_a = _reload(db_session, Note, in_a.id)
        assert note_a is not None and note_a.deleted_at is not None
        listed = client.get("/api/v1/trash").json()
        assert [(i["kind"], i["id"]) for i in listed] == [("note", in_a.id)]

    def test_restore_of_live_item_is_404(self, db_session: Session, user: User, client: TestClient) -> None:
        live = _folder(db_session, user, "Live")

        response = client.post(f"/api/v1/trash/folder/{live.id}/restore")

        assert response.status_code == 404
