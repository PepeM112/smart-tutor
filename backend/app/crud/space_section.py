from collections.abc import Sequence

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.space_section import SpaceSection


def list_by_space(db: Session, *, space_id: str, is_draft: bool) -> Sequence[SpaceSection]:
    stmt = (
        select(SpaceSection)
        .where(SpaceSection.space_id == space_id, SpaceSection.is_draft == is_draft)
        .order_by(SpaceSection.position, SpaceSection.id)
    )
    return db.scalars(stmt).all()


def get_draft(db: Session, *, space_id: str, section_id: str) -> SpaceSection | None:
    stmt = select(SpaceSection).where(
        SpaceSection.id == section_id, SpaceSection.space_id == space_id, SpaceSection.is_draft.is_(True)
    )
    return db.scalars(stmt).first()


def create(
    db: Session, *, space_id: str, title: str, position: int, is_draft: bool, draft_of_id: str | None = None
) -> SpaceSection:
    section = SpaceSection(
        space_id=space_id, title=title, position=position, is_draft=is_draft, draft_of_id=draft_of_id
    )
    db.add(section)
    db.flush()
    return section


def delete(db: Session, *, section: SpaceSection) -> None:
    """The DB cascade removes the items of the section."""
    db.execute(sql_delete(SpaceSection).where(SpaceSection.id == section.id))
    db.flush()


def delete_by_ids(db: Session, *, ids: Sequence[str]) -> None:
    if ids:
        db.execute(sql_delete(SpaceSection).where(SpaceSection.id.in_(ids)))
        db.flush()


def delete_drafts(db: Session, *, space_id: str) -> None:
    """Remove the draft structure. The DB cascade removes the draft items."""
    db.execute(sql_delete(SpaceSection).where(SpaceSection.space_id == space_id, SpaceSection.is_draft.is_(True)))
    db.flush()
