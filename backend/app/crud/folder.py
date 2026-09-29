"""Atomic DB operations for Folder.

No business logic here — ownership checks and cycle detection belong in the service.
"""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Row, func, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session

from app.models.folder import Folder
from app.models.note import Note
from app.schemas.folder import FolderCreate, FolderUpdate


def get_by_id(db: Session, *, id: str) -> Folder | None:
    """Fetch a folder by ID regardless of its trash state."""
    return db.scalars(select(Folder).where(Folder.id == id)).first()


def list_by_user(db: Session, *, user_id: str) -> Sequence[Folder]:
    """Return all LIVE folders for a user, ordered by name (case-insensitive)."""
    stmt = (
        select(Folder).where(Folder.user_id == user_id, Folder.deleted_at.is_(None)).order_by(func.lower(Folder.name))
    )
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
    """
    descendants = select(Folder.id).where(Folder.parent_id == folder_id).cte(name="descendants", recursive=True)
    descendants = descendants.union_all(select(Folder.id).join(descendants, Folder.parent_id == descendants.c.id))
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
    folder_count: int = f_result.rowcount  # type: ignore[assignment]

    # Mark live notes whose folder is in the subtree as trashed.
    n_result = db.execute(
        sql_update(Note).where(Note.folder_id.in_(all_folder_ids), Note.deleted_at.is_(None)).values(deleted_at=now)
    )
    note_count: int = n_result.rowcount  # type: ignore[assignment]

    db.flush()
    return folder_count, note_count


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


def delete(db: Session, *, folder: Folder) -> None:
    db.delete(folder)
    db.flush()


# ---------------------------------------------------------------------------
# Trash read helpers
# ---------------------------------------------------------------------------


def list_trashed_top_folders(db: Session, *, user_id: str) -> Sequence[Folder]:
    """Trashed folders that are the top item of their delete batch.

    Top = parent is live (or None), OR parent has a different deleted_at.
    """
    f = Folder
    parent = Folder.__table__.alias("parent")
    stmt = (
        select(f)
        .outerjoin(parent, f.parent_id == parent.c.id)
        .where(
            f.user_id == user_id,
            f.deleted_at.is_not(None),
            # Top of batch: parent is live or root or trashed at a different time.
            ((f.parent_id.is_(None)) | (parent.c.deleted_at.is_(None)) | (parent.c.deleted_at != f.deleted_at)),
        )
        .order_by(f.deleted_at.desc())
    )
    return db.scalars(stmt).all()


def list_trashed_top_notes(db: Session, *, user_id: str) -> Sequence[Note]:
    """Trashed notes that are the top item of their delete batch.

    Top = folder is live (or None), OR folder has a different deleted_at.
    """
    n = Note
    folder = Folder.__table__.alias("folder")
    stmt = (
        select(n)
        .outerjoin(folder, n.folder_id == folder.c.id)
        .where(
            n.user_id == user_id,
            n.deleted_at.is_not(None),
            ((n.folder_id.is_(None)) | (folder.c.deleted_at.is_(None)) | (folder.c.deleted_at != n.deleted_at)),
        )
        .order_by(n.deleted_at.desc())
    )
    return db.scalars(stmt).all()


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
    # Only purge top-level roots of each batch; the cascade FK removes sub-folders + notes.
    # We identify roots as trashed folders with a live (or absent) parent.
    parent = Folder.__table__.alias("parent")
    stmt = (
        select(Folder)
        .outerjoin(parent, Folder.parent_id == parent.c.id)
        .where(
            Folder.user_id == user_id,
            Folder.deleted_at < before,
            Folder.deleted_at.is_not(None),
            (
                (Folder.parent_id.is_(None))
                | (parent.c.deleted_at.is_(None))
                | (parent.c.deleted_at != Folder.deleted_at)
            ),
        )
    )
    for folder in db.scalars(stmt).all():
        db.delete(folder)
    db.flush()


def purge_old_notes(db: Session, *, user_id: str, before: datetime) -> None:
    """Hard-delete trashed notes older than `before` that are not inside a trashed folder batch."""
    folder = Folder.__table__.alias("folder")
    stmt = (
        select(Note)
        .outerjoin(folder, Note.folder_id == folder.c.id)
        .where(
            Note.user_id == user_id,
            Note.deleted_at < before,
            Note.deleted_at.is_not(None),
            ((Note.folder_id.is_(None)) | (folder.c.deleted_at.is_(None)) | (folder.c.deleted_at != Note.deleted_at)),
        )
    )
    for note in db.scalars(stmt).all():
        db.delete(note)
    db.flush()
