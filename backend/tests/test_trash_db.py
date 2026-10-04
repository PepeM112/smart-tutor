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
from app.crud import folder as folder_crud
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
    """Soft-delete a folder, also when it is empty (`folder_service.delete_folder` removes an empty one)."""
    folder_crud.lock_tree(db, user_id=user.id)
    folder_crud.soft_delete_cascade(db, user_id=user.id, folder_id=folder.id, now=datetime.now(timezone.utc))
    db.commit()


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


# ---------------------------------------------------------------------------
# Delete of an empty folder (forever, no Trash entry)
# ---------------------------------------------------------------------------


class TestDeleteEmptyFolderViaApi:
    def test_empty_folder_is_deleted_forever(self, db_session: Session, user: User, client: TestClient) -> None:
        p = _folder(db_session, user, "P")
        empty = _folder(db_session, user, "Empty", p)
        empty_id = empty.id

        response = client.delete(f"/api/v1/folders/{empty_id}")

        assert response.status_code == 200
        assert response.json() == {"outcome": "deleted"}
        assert _reload(db_session, Folder, empty_id) is None
        assert client.get("/api/v1/trash").json() == []

    def test_folder_with_a_live_note_goes_to_trash(self, db_session: Session, user: User, client: TestClient) -> None:
        full = _folder(db_session, user, "Full")
        _note(db_session, user, "N", full)

        response = client.delete(f"/api/v1/folders/{full.id}")

        assert response.json() == {"outcome": "trashed"}
        listed = client.get("/api/v1/trash").json()
        assert [(i["kind"], i["id"]) for i in listed] == [("folder", full.id)]

    def test_folder_with_a_live_sub_folder_goes_to_trash(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        outer = _folder(db_session, user, "Outer")
        _folder(db_session, user, "Inner", outer)

        response = client.delete(f"/api/v1/folders/{outer.id}")

        assert response.json() == {"outcome": "trashed"}
        listed = client.get("/api/v1/trash").json()
        assert [(i["id"], i["folderCount"]) for i in listed] == [(outer.id, 1)]

    def test_trashed_items_of_earlier_batches_survive(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        # P > E > (trashed note N) and E > (trashed folder S > trashed note M). E has no live content.
        p = _folder(db_session, user, "P")
        e = _folder(db_session, user, "E", p)
        n = _note(db_session, user, "N", e)
        s_folder = _folder(db_session, user, "S", e)
        m = _note(db_session, user, "M", s_folder)
        _trash_note(db_session, user, n)
        _trash_note(db_session, user, m)
        _trash_folder(db_session, user, s_folder)
        e_id, n_id, s_id, m_id, p_id = e.id, n.id, s_folder.id, m.id, p.id

        response = client.delete(f"/api/v1/folders/{e_id}")

        assert response.json() == {"outcome": "deleted"}
        assert _reload(db_session, Folder, e_id) is None
        kept_note = _reload(db_session, Note, n_id)
        kept_folder = _reload(db_session, Folder, s_id)
        assert kept_note is not None and kept_note.deleted_at is not None
        assert (kept_note.folder_id, kept_note.orphan_path) == (p_id, ["E"])
        assert kept_folder is not None and kept_folder.deleted_at is not None
        assert (kept_folder.parent_id, kept_folder.orphan_path) == (p_id, ["E"])
        # M stays inside S: only the direct children of E moved.
        kept_inner = _reload(db_session, Note, m_id)
        assert kept_inner is not None and kept_inner.folder_id == s_id
        listed = client.get("/api/v1/trash").json()
        # S and N keep the path of E. M was trashed alone: it is a top item inside S.
        assert sorted((i["kind"], i["originalPath"]) for i in listed) == [
            ("folder", "/P/E"),
            ("note", "/P/E"),
            ("note", "/P/E/S"),
        ]

    def test_deleted_folder_can_be_recreated_with_same_name(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        # The Undo of the toast creates the folder again: the name must be free.
        p = _folder(db_session, user, "P")
        empty = _folder(db_session, user, "Empty", p)
        client.delete(f"/api/v1/folders/{empty.id}")

        response = client.post("/api/v1/folders", json={"name": "Empty", "parentId": p.id})

        assert response.status_code == 201


# ---------------------------------------------------------------------------
# Tree of a trashed folder; restore / delete forever of its sub-items
# ---------------------------------------------------------------------------


class TestTrashTreeViaApi:
    @staticmethod
    def _batch(db: Session, user: User) -> dict[str, str]:
        """P > A > (B > "in B", C, "in A"). One batch: trash A. Returns the ids by name."""
        p = _folder(db, user, "P")
        a = _folder(db, user, "A", p)
        b = _folder(db, user, "B", a)
        c = _folder(db, user, "C", a)
        in_b = _note(db, user, "in B", b)
        in_a = _note(db, user, "in A", a)
        _note(db, user, "keeps C non-empty", c)
        _trash_folder(db, user, a)
        return {"p": p.id, "a": a.id, "b": b.id, "c": c.id, "in_b": in_b.id, "in_a": in_a.id}

    @staticmethod
    def _top(client: TestClient, folder_id: str) -> dict[str, int]:
        listed = {i["id"]: i for i in client.get("/api/v1/trash").json()}
        return {"folders": listed[folder_id]["folderCount"], "notes": listed[folder_id]["noteCount"]}

    def test_tree_holds_the_batch_only(self, db_session: Session, user: User, client: TestClient) -> None:
        ids = self._batch(db_session, user)

        response = client.get(f"/api/v1/trash/folders/{ids['a']}/tree")

        assert response.status_code == 200
        body = response.json()
        assert [(f["name"], f["parentId"]) for f in body["folders"]] == [("B", ids["a"]), ("C", ids["a"])]
        assert sorted((n["title"], n["folderId"]) for n in body["notes"]) == [
            ("in A", ids["a"]),
            ("in B", ids["b"]),
            ("keeps C non-empty", ids["c"]),
        ]

    def test_tree_leaves_out_items_of_other_batches(self, db_session: Session, user: User, client: TestClient) -> None:
        p = _folder(db_session, user, "P")
        a = _folder(db_session, user, "A", p)
        old = _note(db_session, user, "old", a)
        old_folder = _folder(db_session, user, "old folder", a)
        _note(db_session, user, "recent", a)
        _folder(db_session, user, "recent folder", a)
        _trash_note(db_session, user, old)
        _trash_folder(db_session, user, old_folder)
        _trash_folder(db_session, user, a)

        body = client.get(f"/api/v1/trash/folders/{a.id}/tree").json()

        assert [n["title"] for n in body["notes"]] == ["recent"]
        assert [f["name"] for f in body["folders"]] == ["recent folder"]

    def test_tree_of_live_folder_is_404(self, db_session: Session, user: User, client: TestClient) -> None:
        live = _folder(db_session, user, "Live")

        assert client.get(f"/api/v1/trash/folders/{live.id}/tree").status_code == 404

    def test_tree_of_sub_folder_gives_its_part(self, db_session: Session, user: User, client: TestClient) -> None:
        ids = self._batch(db_session, user)

        body = client.get(f"/api/v1/trash/folders/{ids['b']}/tree").json()

        assert body["folders"] == []
        assert [n["id"] for n in body["notes"]] == [ids["in_b"]]

    def test_delete_forever_of_sub_note_updates_top_counts(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        ids = self._batch(db_session, user)
        assert self._top(client, ids["a"]) == {"folders": 2, "notes": 3}

        response = client.delete(f"/api/v1/trash/note/{ids['in_b']}")

        assert response.status_code == 204
        assert self._top(client, ids["a"]) == {"folders": 2, "notes": 2}
        tree = client.get(f"/api/v1/trash/folders/{ids['a']}/tree").json()
        assert ids["in_b"] not in [n["id"] for n in tree["notes"]]

    def test_delete_forever_of_sub_folder_updates_top_counts(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        ids = self._batch(db_session, user)

        response = client.delete(f"/api/v1/trash/folder/{ids['b']}")

        assert response.status_code == 204
        assert _reload(db_session, Folder, ids["b"]) is None
        assert _reload(db_session, Note, ids["in_b"]) is None  # Same batch: removed with B.
        assert self._top(client, ids["a"]) == {"folders": 1, "notes": 2}

    def test_delete_forever_of_sub_folder_keeps_other_batch_items(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        # P > A > B > N. N is trashed first (own batch), then A (with B). Delete B forever.
        p = _folder(db_session, user, "P")
        a = _folder(db_session, user, "A", p)
        b = _folder(db_session, user, "B", a)
        n = _note(db_session, user, "N", b)
        _trash_note(db_session, user, n)
        _trash_folder(db_session, user, a)
        a_id, b_id, n_id = a.id, b.id, n.id

        response = client.delete(f"/api/v1/trash/folder/{b_id}")

        assert response.status_code == 204
        survivor = _reload(db_session, Note, n_id)
        assert survivor is not None and survivor.deleted_at is not None
        assert (survivor.folder_id, survivor.orphan_path) == (a_id, ["B"])
        listed = client.get("/api/v1/trash").json()
        paths = {(i["kind"], i["originalPath"]) for i in listed}
        assert ("note", "/P/A/B") in paths

    def test_restore_of_sub_note_keeps_siblings_listed_with_right_counts(
        self, db_session: Session, user: User, client: TestClient
    ) -> None:
        ids = self._batch(db_session, user)

        response = client.post(f"/api/v1/trash/note/{ids['in_b']}/restore")

        assert response.status_code == 204
        # A and B come back as rows. Their other content stays in Trash, as new top items.
        listed = {(i["kind"], i["id"]): i for i in client.get("/api/v1/trash").json()}
        assert set(listed) == {("folder", ids["c"]), ("note", ids["in_a"])}
        assert (listed[("folder", ids["c"])]["folderCount"], listed[("folder", ids["c"])]["noteCount"]) == (0, 1)
        assert listed[("folder", ids["c"])]["originalPath"] == "/P/A"
        tree = client.get(f"/api/v1/trash/folders/{ids['c']}/tree").json()
        assert len(tree["notes"]) == 1
