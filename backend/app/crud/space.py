from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.space import Space


def get_by_id(db: Session, *, id: str) -> Space | None:
    stmt = select(Space).where(Space.id == id)
    return db.scalars(stmt).first()
