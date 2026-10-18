from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session

from app.core.enums import AttemptStatus
from app.models.space_attempt import SpaceAttempt


def get(db: Session, *, attempt_id: str, for_update: bool = False) -> SpaceAttempt | None:
    stmt = select(SpaceAttempt).where(SpaceAttempt.id == attempt_id)
    return db.scalars(stmt.with_for_update() if for_update else stmt).first()


def get_open(db: Session, *, user_id: str, item_id: str) -> SpaceAttempt | None:
    stmt = select(SpaceAttempt).where(
        SpaceAttempt.user_id == user_id,
        SpaceAttempt.item_id == item_id,
        SpaceAttempt.status == int(AttemptStatus.OPEN),
    )
    return db.scalars(stmt).first()


def has_live_open(db: Session, *, user_id: str, now: datetime, grace_seconds: int) -> bool:
    """True when the user has an OPEN attempt that is not past its deadline plus grace (no deadline: always live)."""
    deadline_limit = now - timedelta(seconds=grace_seconds)
    stmt = (
        select(SpaceAttempt.id)
        .where(
            SpaceAttempt.user_id == user_id,
            SpaceAttempt.status == int(AttemptStatus.OPEN),
            or_(SpaceAttempt.deadline_at.is_(None), SpaceAttempt.deadline_at > deadline_limit),
        )
        .limit(1)
    )
    return db.scalars(stmt).first() is not None


def list_by_user_items(db: Session, *, user_id: str, item_ids: Sequence[str]) -> Sequence[SpaceAttempt]:
    """Every attempt of the user on these items, oldest first."""
    if not item_ids:
        return []
    stmt = (
        select(SpaceAttempt)
        .where(SpaceAttempt.user_id == user_id, SpaceAttempt.item_id.in_(item_ids))
        .order_by(SpaceAttempt.started_at, SpaceAttempt.id)
    )
    return db.scalars(stmt).all()


def count_by_variant(db: Session, *, user_id: str, item_id: str, since: datetime | None = None) -> dict[str, int]:
    """`{test_id: started attempts}` of the user on the item. `since`: only attempts started after it."""
    stmt = (
        select(SpaceAttempt.test_id, func.count())
        .where(SpaceAttempt.user_id == user_id, SpaceAttempt.item_id == item_id)
        .group_by(SpaceAttempt.test_id)
    )
    if since is not None:
        stmt = stmt.where(SpaceAttempt.started_at > since)
    return {test_id: count for test_id, count in db.execute(stmt).all()}


def create(
    db: Session,
    *,
    item_id: str,
    user_id: str,
    test_id: str,
    test_version: int,
    started_at: datetime,
    deadline_at: datetime | None,
) -> SpaceAttempt:
    attempt = SpaceAttempt(
        item_id=item_id,
        user_id=user_id,
        test_id=test_id,
        test_version=test_version,
        status=int(AttemptStatus.OPEN),
        started_at=started_at,
        deadline_at=deadline_at,
    )
    db.add(attempt)
    db.flush()
    return attempt


def close(
    db: Session,
    *,
    attempt: SpaceAttempt,
    status: AttemptStatus,
    finished_at: datetime,
    test_result_id: str | None = None,
) -> None:
    attempt.status = int(status)
    attempt.finished_at = finished_at
    attempt.test_result_id = test_result_id
    db.flush()


def expire_open_for_variants(db: Session, *, item_id: str, test_ids: Sequence[str], finished_at: datetime) -> None:
    """Close the OPEN attempts on variants that left the item (they can not be submitted any more)."""
    if not test_ids:
        return
    db.execute(
        sql_update(SpaceAttempt)
        .where(
            SpaceAttempt.item_id == item_id,
            SpaceAttempt.test_id.in_(test_ids),
            SpaceAttempt.status == int(AttemptStatus.OPEN),
        )
        .values(status=int(AttemptStatus.EXPIRED), finished_at=finished_at)
    )
    db.flush()
