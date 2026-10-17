from collections.abc import Sequence

from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.space_item import SpaceItem


def list_by_space(db: Session, *, space_id: str, is_draft: bool) -> Sequence[SpaceItem]:
    stmt = (
        select(SpaceItem)
        .where(SpaceItem.space_id == space_id, SpaceItem.is_draft == is_draft)
        .order_by(SpaceItem.position, SpaceItem.id)
    )
    return db.scalars(stmt).all()


def get_draft(db: Session, *, space_id: str, item_id: str) -> SpaceItem | None:
    stmt = select(SpaceItem).where(
        SpaceItem.id == item_id, SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(True)
    )
    return db.scalars(stmt).first()


def next_position(db: Session, *, section_id: str) -> int:
    current = db.scalar(select(func.max(SpaceItem.position)).where(SpaceItem.section_id == section_id))
    return 0 if current is None else current + 1


def create(
    db: Session,
    *,
    space_id: str,
    section_id: str,
    kind: int,
    position: int,
    is_draft: bool,
    note_id: str | None = None,
    test_id: str | None = None,
    child_space_id: str | None = None,
    draft_of_id: str | None = None,
) -> SpaceItem:
    item = SpaceItem(
        space_id=space_id,
        section_id=section_id,
        kind=kind,
        note_id=note_id,
        test_id=test_id,
        child_space_id=child_space_id,
        position=position,
        is_draft=is_draft,
        draft_of_id=draft_of_id,
    )
    db.add(item)
    db.flush()
    return item


def delete(db: Session, *, item: SpaceItem) -> None:
    db.execute(sql_delete(SpaceItem).where(SpaceItem.id == item.id))
    db.flush()


def delete_by_ids(db: Session, *, ids: Sequence[str]) -> None:
    if ids:
        db.execute(sql_delete(SpaceItem).where(SpaceItem.id.in_(ids)))
        db.flush()
