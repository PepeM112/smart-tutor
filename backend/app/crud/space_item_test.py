from collections.abc import Sequence

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.space_item import SpaceItem
from app.models.space_item_test import SpaceItemTest


def list_by_items(db: Session, *, item_ids: Sequence[str]) -> dict[str, list[str]]:
    """`{item_id: [test ids in order]}`. An item without a variant has no key."""
    if not item_ids:
        return {}
    stmt = (
        select(SpaceItemTest.item_id, SpaceItemTest.test_id)
        .where(SpaceItemTest.item_id.in_(item_ids))
        .order_by(SpaceItemTest.item_id, SpaceItemTest.position, SpaceItemTest.test_id)
    )
    links: dict[str, list[str]] = {}
    for item_id, test_id in db.execute(stmt).all():
        links.setdefault(item_id, []).append(test_id)
    return links


def list_published_items_for_test(db: Session, *, test_id: str) -> Sequence[SpaceItem]:
    """The published items that link `test_id`."""
    stmt = (
        select(SpaceItem)
        .join(SpaceItemTest, SpaceItemTest.item_id == SpaceItem.id)
        .where(SpaceItemTest.test_id == test_id, SpaceItem.is_draft.is_(False))
    )
    return db.scalars(stmt).all()


def replace(db: Session, *, item_id: str, test_ids: Sequence[str]) -> None:
    """Set the variants of an item, in this order."""
    db.execute(sql_delete(SpaceItemTest).where(SpaceItemTest.item_id == item_id))
    db.add_all(SpaceItemTest(item_id=item_id, test_id=t, position=p) for p, t in enumerate(test_ids))
    db.flush()
