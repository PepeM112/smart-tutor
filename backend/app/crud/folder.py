"""Atomic DB operations for Folder.

No business logic here — ownership checks and cycle detection belong in the service.
"""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Row, Select, func, or_, select
from sqlalchemy import delete as sql_delete
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session, aliased

from app.models.folder import Folder
from app.models.note import Note
from app.schemas.folder import FolderCreate, FolderUpdate


def get_by_id(db: Session, *, id: str) -> Folder | None:
    """Fetch a folder by ID regardless of its trash state."""
    return db.scalars(select(Folder).where(Folder.id == id)).first()


def lock_tree(db: Session, *, user_id: str) -> None:
    """Take the per-user tree lock (a transaction-level advisory lock) and wait for it.

    Every write that changes where a folder or note is, or whether it is in Trash, takes this
    lock first, so the tree writes of one user run one after the other. Commit or rollback
    releases it. The "tree:" prefix keeps these keys apart from other advisory locks.

    Pending changes are flushed first, so `expire_all` can not drop them. Then the objects
    that this session read before the lock are expired: the next access reads the state that
    the other transaction committed while this one waited.
    """
    db.flush()
    db.execute(select(func.pg_advisory_xact_lock(func.hashtext(f"tree:{user_id}"))))
    db.expire_all()


def list_by_user(db: Session, *, user_id: str, include_trashed: bool = False) -> Sequence[Folder]:
    """Return the folders of a user ordered by name (case-insensitive). LIVE only unless `include_trashed`."""
    stmt = select(Folder).where(Folder.user_id == user_id).order_by(func.lower(Folder.name))
    if not include_trashed:
        stmt = stmt.where(Folder.deleted_at.is_(None))
    return db.scalars(stmt).all()


def list_tree_folders(db: Session, *, user_id: str) -> Sequence[Row[tuple[str, str, str | None, datetime]]]:
    """Light folder columns for the file-tree endpoint; live only, ordered by name (case-insensitive)."""
    stmt = (
        select(Folder.id, Folder.name, Folder.parent_id, Folder.updated_at)
        .where(Folder.user_id == user_id, Folder.deleted_at.is_(None))
        .order_by(func.lower(Folder.name))
    )
    return db.execute(stmt).fetchall()


def get_live_child_by_name(db: Session, *, user_id: str, parent_id: str | None, name: str) -> Folder | None:
    """Return the LIVE folder with this name (case-insensitive) in `parent_id`, or None."""
    return db.scalars(
        select(Folder).where(
            Folder.user_id == user_id,
            Folder.parent_id == parent_id,
            func.lower(Folder.name) == name.lower(),
            Folder.deleted_at.is_(None),
        )
    ).first()


def sibling_name_exists(
    db: Session,
    *,
    user_id: str,
    parent_id: str | None,
    name: str,
    exclude_id: str | None = None,
) -> bool:
    """Check if a LIVE folder with the same name (case-insensitive) exists in the same parent."""
    # The unique index `ix_folder_sibling_name` allows at most one such live folder, so one
    # lookup is sufficient: when it is `exclude_id` itself, there is no other.
    existing = get_live_child_by_name(db, user_id=user_id, parent_id=parent_id, name=name)
    return existing is not None and existing.id != exclude_id


def get_descendant_ids(db: Session, *, folder_id: str) -> list[str]:
    """Return all descendant folder IDs (excluding the folder itself) via recursive CTE.

    Includes trashed descendants — the caller decides what to filter.
    Uses UNION (distinct) instead of UNION ALL to avoid duplicates in cyclic-safe traversal.
    """
    descendants = select(Folder.id).where(Folder.parent_id == folder_id).cte(name="descendants", recursive=True)
    descendants = descendants.union(select(Folder.id).join(descendants, Folder.parent_id == descendants.c.id))
    return list(db.scalars(select(descendants.c.id)).all())


def count_live_descendants(db: Session, *, user_id: str, folder_id: str) -> tuple[int, int]:
    """Return (folder_count, note_count) of LIVE items in the subtree of `folder_id`.

    `folder_count` does not include `folder_id` itself. `note_count` includes the notes
    directly in `folder_id` and the notes in its descendants.
    """
    desc_ids = get_descendant_ids(db, folder_id=folder_id)
    all_ids = [folder_id, *desc_ids]

    live_folder_count_stmt = select(func.count()).where(Folder.id.in_(desc_ids), Folder.deleted_at.is_(None))
    live_folder_count = db.scalar(live_folder_count_stmt) or 0

    note_count_stmt = select(func.count()).where(
        Note.user_id == user_id, Note.folder_id.in_(all_ids), Note.deleted_at.is_(None)
    )
    note_count = db.scalar(note_count_stmt) or 0

    return live_folder_count, note_count


def soft_delete_cascade(db: Session, *, user_id: str, folder_id: str, now: datetime) -> None:
    """Soft-delete a folder and all its LIVE descendants and their LIVE notes.

    All get the same `now` timestamp so they form one restorable batch.
    """
    desc_ids = get_descendant_ids(db, folder_id=folder_id)
    all_folder_ids = [folder_id, *desc_ids]

    # Mark live folders in the subtree (including the root) as trashed.
    db.execute(
        sql_update(Folder).where(Folder.id.in_(all_folder_ids), Folder.deleted_at.is_(None)).values(deleted_at=now)
    )

    # Mark live notes whose folder is in the subtree as trashed.
    db.execute(
        sql_update(Note)
        .where(Note.user_id == user_id, Note.folder_id.in_(all_folder_ids), Note.deleted_at.is_(None))
        .values(deleted_at=now)
    )

    db.flush()


def list_batch_folders(db: Session, *, folder: Folder) -> Sequence[Folder]:
    """Return `folder` and the folders of its subtree that are in the same trash batch (same `deleted_at`)."""
    desc_ids = get_descendant_ids(db, folder_id=folder.id)
    stmt = select(Folder).where(Folder.id.in_([folder.id, *desc_ids]), Folder.deleted_at == folder.deleted_at)
    return db.scalars(stmt).all()


def list_children_outside_batch(
    db: Session, *, parent_ids: Sequence[str], batch_ts: datetime | None
) -> Sequence[Folder]:
    """Return the folders directly in `parent_ids` that are not in the batch `batch_ts` (live or another batch)."""
    stmt = select(Folder).where(Folder.parent_id.in_(parent_ids), Folder.deleted_at.is_distinct_from(batch_ts))
    return db.scalars(stmt).all()


def reparent(db: Session, *, folder: Folder, parent_id: str | None, orphan_path: list[str]) -> Folder:
    """Put a folder under `parent_id` and set its `orphan_path`. `deleted_at` is not changed."""
    folder.parent_id = parent_id
    folder.orphan_path = orphan_path
    db.flush()
    return folder


def create(db: Session, *, user_id: str, data: FolderCreate) -> Folder:
    folder = Folder(user_id=user_id, name=data.name, parent_id=data.parent_id)
    db.add(folder)
    db.flush()
    return folder


def update(db: Session, *, folder: Folder, data: FolderUpdate) -> Folder:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(folder, field, value)
    db.flush()
    return folder


def hard_delete(db: Session, *, folder: Folder) -> None:
    """Permanently delete a folder. FK CASCADE removes ALL its sub-folders and notes.

    To keep the items of other trash batches, the caller must move them out of the subtree
    first (`trash_service._detach_other_batches`).
    """
    db.delete(folder)
    db.flush()


def relocate(db: Session, *, folder: Folder, name: str, parent_id: str | None) -> Folder:
    """Set the restored place of a folder (name + parent) and clear its `orphan_path`.

    `deleted_at` is left alone: `restore_folder_batch` needs it as the batch key.
    """
    folder.name = name
    folder.parent_id = parent_id
    folder.orphan_path = None
    db.flush()
    return folder


def restore_row(db: Session, *, folder: Folder, name: str, parent_id: str | None) -> Folder:
    """Bring back ONE trashed folder row (no contents) at the given place."""
    relocate(db, folder=folder, name=name, parent_id=parent_id)
    folder.deleted_at = None
    db.flush()
    return folder


def delete_all_trashed(db: Session, *, user_id: str) -> None:
    """Bulk-delete every trashed folder of the user (one DELETE; FK CASCADE removes sub-rows).

    Safe for live items: by invariant a live folder or note never sits under a trashed folder
    (soft delete trashes the whole subtree, and move/create reject trashed targets). The
    cascade can only reach rows that are trashed too, and those are deleted here anyway.
    """
    db.execute(sql_delete(Folder).where(Folder.user_id == user_id, Folder.deleted_at.is_not(None)))
    db.flush()


# ---------------------------------------------------------------------------
# Trash read helpers
# ---------------------------------------------------------------------------


def _trashed_top_folders_stmt(user_id: str) -> Select[tuple[Folder]]:
    """Trashed folders that are the top item of their delete batch.

    Top = parent is root, live, or trashed at a different time.
    """
    parent = aliased(Folder)
    return (
        select(Folder)
        .outerjoin(parent, Folder.parent_id == parent.id)
        .where(
            Folder.user_id == user_id,
            Folder.deleted_at.is_not(None),
            or_(Folder.parent_id.is_(None), parent.deleted_at.is_(None), parent.deleted_at != Folder.deleted_at),
        )
    )


def list_trashed_top_folders(db: Session, *, user_id: str) -> Sequence[Folder]:
    """Trashed folders that are the top item of their delete batch, newest first."""
    return db.scalars(_trashed_top_folders_stmt(user_id).order_by(Folder.deleted_at.desc())).all()


def count_batch_items(db: Session, *, user_id: str, folder_id: str, deleted_at: datetime) -> tuple[int, int]:
    """Count the sub-folders and notes that belong to the same delete batch as `folder_id`."""
    desc_ids = get_descendant_ids(db, folder_id=folder_id)

    sub_folder_count = (
        db.scalar(
            select(func.count()).where(
                Folder.id.in_(desc_ids),
                Folder.deleted_at == deleted_at,
            )
        )
        or 0
    )

    all_ids = [folder_id, *desc_ids]
    note_count = (
        db.scalar(
            select(func.count()).where(
                Note.user_id == user_id,
                Note.folder_id.in_(all_ids),
                Note.deleted_at == deleted_at,
            )
        )
        or 0
    )

    return sub_folder_count, note_count


def restore_folder_batch(db: Session, *, folder: Folder) -> None:
    """Restore a folder and all items with the same deleted_at in its subtree."""
    batch_ts = folder.deleted_at
    desc_ids = get_descendant_ids(db, folder_id=folder.id)
    all_folder_ids = [folder.id, *desc_ids]

    db.execute(
        sql_update(Folder).where(Folder.id.in_(all_folder_ids), Folder.deleted_at == batch_ts).values(deleted_at=None)
    )
    db.execute(
        sql_update(Note)
        .where(Note.user_id == folder.user_id, Note.folder_id.in_(all_folder_ids), Note.deleted_at == batch_ts)
        .values(deleted_at=None)
    )
    db.flush()


def list_expired_top_folders(db: Session, *, user_id: str, before: datetime) -> Sequence[Folder]:
    """Trashed folders that are the top item of their delete batch and were trashed before `before`."""
    return db.scalars(_trashed_top_folders_stmt(user_id).where(Folder.deleted_at < before)).all()
