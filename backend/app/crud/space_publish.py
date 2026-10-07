from sqlalchemy.orm import Session

from app.models.space_publish import SpacePublish


def create(
    db: Session,
    *,
    space_id: str,
    published_by: str,
    message: str | None,
    notify_members: bool,
    reset_item_ids: list[str],
) -> SpacePublish:
    row = SpacePublish(
        space_id=space_id,
        published_by=published_by,
        message=message,
        notify_members=notify_members,
        reset_item_ids=reset_item_ids,
    )
    db.add(row)
    db.flush()
    return row
