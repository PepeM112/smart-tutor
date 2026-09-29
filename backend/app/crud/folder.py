"""Atomic DB operations for Folder.

No business logic here — ownership checks and cycle detection belong in the service.
"""

from collections.abc import Mapping, Sequence
from datetime import datetime

from sqlalchemy import Row, Select, func, or_, select
from sqlalchemy import delete as sql_delete
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session, aliased

from app.crud.helpers import rowcount
from app.models.folder import Folder
from app.models.note import Note
from app.schemas.folder import FolderCreate, FolderUpdate


def get_by_id(db: Session, *, id: str) -> Folder | None:
    """Fetch a folder by ID regardless of its trash state."""
    return db.scalars(select(Folder).where(Folder.id == id)).first()


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


def list_tree_notes(db: Session, *, user_id: str) -> Sequence[Row[tuple[str, str, str | None, datetime]]]:
    """Light note columns (no content) for the file-tree endpoint; live only, ordered by title (case-insensitive)."""
    stmt = (
        select(Note.id, Note.title, Note.folder_id, Note.updated_at)
        .where(Note.user_id == user_id, Note.deleted_at.is_(None))
        .order_by(func.lower(Note.title))
    )
    return db.execute(stmt).fetchall()


def sibling_name_exists(
    db: Session,
    *,
    user_id: str,
    parent_id: str | None,
    name: str,
    exclude_id: str | None = None,
) -> bool:
    """Check if a LIVE folder with the same name (case-insensitive) exists in the same parent."""
    stmt = select(Folder).where(
        Folder.user_id == user_id,
        Folder.parent_id == parent_id,
        func.lower(Folder.name) == name.lower(),
        Folder.deleted_at.is_(None),
    )
    if exclude_id:
        stmt = stmt.where(Folder.id != exclude_id)
    return db.scalars(stmt).first() is not None


def get_descendant_ids(db: Session, *, folder_id: str) -> list[str]:
    """Return all descendant folder IDs (excluding the folder itself) via recursive CTE.

    Includes trashed descendants — the caller decides what to filter.
    Uses UNION (distinct) instead of UNION ALL to avoid duplicates in cyclic-safe traversal.
    """
    descendants = select(Folder.id).where(Folder.parent_id == folder_id).cte(name="descendants", recursive=True)
    descendants = descendants.union(select(Folder.id).join(descendants, Folder.parent_id == descendants.c.id))
    return list(db.scalars(select(descendants.c.id)).all())


def count_live_descendants(db: Session, *, folder_id: str) -> tuple[int, int]:
    """Return (folder_count, note_count) of LIVE items in the subtree (exclusive of folder_id itself)."""
    desc_ids = get_descendant_ids(db, folder_id=folder_id)
    all_ids = [folder_id, *desc_ids]

    live_folder_count_stmt = select(func.count()).where(Folder.id.in_(desc_ids), Folder.deleted_at.is_(None))
    live_folder_count = db.scalar(live_folder_count_stmt) or 0

    note_count_stmt = select(func.count()).where(Note.folder_id.in_(all_ids), Note.deleted_at.is_(None))
    note_count = db.scalar(note_count_stmt) or 0

    return live_folder_count, note_count


def soft_delete_cascade(db: Session, *, folder_id: str, now: datetime) -> tuple[int, int]:
    """Soft-delete a folder and all its LIVE descendants and their LIVE notes.

    Returns (folder_count, note_count) of items actually trashed in this call.
    All get the same `now` timestamp so they form one restorable batch.
    """
    desc_ids = get_descendant_ids(db, folder_id=folder_id)
    all_folder_ids = [folder_id, *desc_ids]

    # Mark live folders in the subtree (including the root) as trashed.
    f_result = db.execute(
        sql_update(Folder).where(Folder.id.in_(all_folder_ids), Folder.deleted_at.is_(None)).values(deleted_at=now)
    )
    folder_count = rowcount(f_result)

    # Mark live notes whose folder is in the subtree as trashed.
    n_result = db.execute(
        sql_update(Note).where(Note.folder_id.in_(all_folder_ids), Note.deleted_at.is_(None)).values(deleted_at=now)
    )
    note_count = rowcount(n_result)

    db.flush()
    return folder_count, note_count


def build_orphan_path(
    batch_folders: Mapping[str, tuple[str, str | None]],
    *,
    top_id: str,
    start_id: str,
    existing: list[str] | None,
) -> list[str]:
    """Return the names from `top_id` down to `start_id` (outermost first) + `existing`.

    `batch_folders` maps folder id -> (name, parent_id). The walk goes up from `start_id`
    and stops after `top_id`. `existing` is added at the END: it is the older path that
    lies below `start_id`, so the new names must come before it.
    """
    names: list[str] = []
    current: str | None = start_id
    seen: set[str] = set()
    while current is not None and current in batch_folders and current not in seen:
        seen.add(current)
        name, parent_id = batch_folders[current]
        names.append(name)
        if current == top_id:
            break
        current = parent_id
    return [*reversed(names), *(existing or [])]


def detach_other_batches(db: Session, *, folder: Folder) -> None:
    """Move items of other trash batches out of `folder`'s subtree before it is hard-deleted.

    FK CASCADE would delete every row under `folder`. Items of a *different* batch
    (deleted_at != folder.deleted_at) must survive, so each one is re-parented to the parent
    of `folder` (which survives; it can be live, trashed or root). The names of the deleted
    folders between `folder` and the item are saved in `orphan_path`, so restore can
    rebuild the original location.
    """
    batch_ts = folder.deleted_at
    desc_ids = get_descendant_ids(db, folder_id=folder.id)
    # Only folders of this batch are deleted. An item of another batch keeps its own children:
    # it is moved only when its parent is in this batch.
    batch_rows = db.execute(
        select(Folder.id, Folder.name, Folder.parent_id).where(
            Folder.id.in_([folder.id, *desc_ids]), Folder.deleted_at == batch_ts
        )
    ).all()
    batch_folders: dict[str, tuple[str, str | None]] = {row.id: (row.name, row.parent_id) for row in batch_rows}
    batch_ids = list(batch_folders)

    orphan_folders = db.scalars(
        select(Folder).where(Folder.parent_id.in_(batch_ids), Folder.deleted_at.is_distinct_from(batch_ts))
    ).all()
    orphan_notes = db.scalars(
        select(Note).where(Note.folder_id.in_(batch_ids), Note.deleted_at.is_distinct_from(batch_ts))
    ).all()

    def _path_for(start_id: str | None, existing: list[str] | None) -> list[str]:
        return build_orphan_path(batch_folders, top_id=folder.id, start_id=start_id or folder.id, existing=existing)

    for child in orphan_folders:
        child.orphan_path = _path_for(child.parent_id, child.orphan_path)
        child.parent_id = folder.parent_id
    for note in orphan_notes:
        note.orphan_path = _path_for(note.folder_id, note.orphan_path)
        note.folder_id = folder.parent_id

    db.flush()


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
    """Permanently delete a folder. FK CASCADE removes its sub-folders and notes.

    Items of other trash batches are moved out of the subtree first (see `detach_other_batches`),
    so only the batch of `folder` disappears.
    """
    detach_other_batches(db, folder=folder)
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


def _trashed_top_notes_stmt(user_id: str) -> Select[tuple[Note]]:
    """Trashed notes that are the top item of their delete batch.

    Top = folder is none, live, or trashed at a different time.
    """
    folder = aliased(Folder)
    return (
        select(Note)
        .outerjoin(folder, Note.folder_id == folder.id)
        .where(
            Note.user_id == user_id,
            Note.deleted_at.is_not(None),
            or_(Note.folder_id.is_(None), folder.deleted_at.is_(None), folder.deleted_at != Note.deleted_at),
        )
    )


def list_trashed_top_folders(db: Session, *, user_id: str) -> Sequence[Folder]:
    """Trashed folders that are the top item of their delete batch, newest first."""
    return db.scalars(_trashed_top_folders_stmt(user_id).order_by(Folder.deleted_at.desc())).all()


def list_trashed_top_notes(db: Session, *, user_id: str) -> Sequence[Note]:
    """Trashed notes that are the top item of their delete batch, newest first."""
    return db.scalars(_trashed_top_notes_stmt(user_id).order_by(Note.deleted_at.desc())).all()


def count_batch_items(db: Session, *, folder_id: str, deleted_at: datetime) -> tuple[int, int]:
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
        sql_update(Note).where(Note.folder_id.in_(all_folder_ids), Note.deleted_at == batch_ts).values(deleted_at=None)
    )
    db.flush()


def purge_old_folders(db: Session, *, user_id: str, before: datetime) -> None:
    """Hard-delete trashed folders older than `before`. FK cascade removes children."""
    # Only the top of each batch is purged; the cascade FK removes its sub-folders + notes.
    stmt = _trashed_top_folders_stmt(user_id).where(Folder.deleted_at < before)
    for folder in db.scalars(stmt).all():
        # Same rule as "Delete forever": items of another batch survive with their orphan_path.
        hard_delete(db, folder=folder)


def purge_old_notes(db: Session, *, user_id: str, before: datetime) -> None:
    """Hard-delete trashed notes older than `before` that are not inside a trashed folder batch."""
    stmt = _trashed_top_notes_stmt(user_id).where(Note.deleted_at < before)
    for note in db.scalars(stmt).all():
        db.delete(note)
    db.flush()
