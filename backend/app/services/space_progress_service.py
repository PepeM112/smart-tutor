"""Progress of a VIEWER in a course: item state, completion rules and course percent (see docs/spaces.md).

Only VIEWER members have rows. Owner and editor preview the course: no completion rows, no
attempt rows, no limits. This module has no HTTP rules; the mark / visit endpoints are in
`space_member_service`, the attempt flow is in `space_attempt_service`.

Functions that write only flush. The caller commits.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.constants import ATTEMPT_GRACE_SECONDS
from app.core.enums import AttemptStatus, MemberStatus, RevealAnswers, SpaceItemKind
from app.crud import space as space_crud
from app.crud import space_attempt as space_attempt_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import space_member as space_member_crud
from app.crud import test_result as test_result_crud
from app.models.space_attempt import SpaceAttempt
from app.models.space_item import SpaceItem
from app.models.space_member import SpaceMember
from app.models.test_result import TestResult
from app.schemas.space import SpaceProgress


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def is_past_grace(attempt: SpaceAttempt, *, at: datetime) -> bool:
    """An OPEN timed attempt that can not be submitted any more: past the deadline + the grace."""
    return attempt.deadline_at is not None and at > attempt.deadline_at + timedelta(seconds=ATTEMPT_GRACE_SECONDS)


def is_hidden(item: SpaceItem, *, at: datetime) -> bool:
    """A published item that students can not see yet (`visible_from` in the future)."""
    return not item.is_draft and item.visible_from is not None and item.visible_from > at


def get_member_row(db: Session, *, space_id: str, user_id: str, for_update: bool = False) -> SpaceMember | None:
    """The ACTIVE member row of `user_id` in a course: the ONE place that reads it for personal state.

    A student of a classroom has no row in its courses. The first call makes a lazy row (`role` NULL,
    ACTIVE), which holds the personal state (progress, Review opt-in, last item) and inherits the role
    of the classroom. None when the user has no access through a row (the owner, a stranger, a pending
    or removed member). `for_update` locks the row until the transaction ends.
    """
    fetch = space_member_crud.get_for_update if for_update else space_member_crud.get
    row = fetch(db, space_id=space_id, user_id=user_id)
    if row is not None and row.role is not None:
        return row if row.status == int(MemberStatus.ACTIVE) else None
    space = space_crud.get_by_id(db, id=space_id)
    if space is None or space.parent_id is None:
        return None
    # A lazy row (role NULL) is only good while the user is an ACTIVE member of the classroom.
    parent_row = space_member_crud.get(db, space_id=space.parent_id, user_id=user_id)
    if parent_row is None or parent_row.status != int(MemberStatus.ACTIVE) or parent_row.role is None:
        return None
    if row is not None:
        return row if row.status == int(MemberStatus.ACTIVE) else None
    try:
        # A savepoint: when a parallel call made the row first, keep that row, not a 500.
        with db.begin_nested():
            space_member_crud.create(
                db,
                space_id=space_id,
                user_id=user_id,
                role=None,
                status=int(MemberStatus.ACTIVE),
                invited_by=None,
                joined_at=utcnow(),
            )
    except IntegrityError:
        pass
    return fetch(db, space_id=space_id, user_id=user_id)


@dataclass(frozen=True)
class AttemptState:
    """What a VIEWER sees about one TEST item."""

    completed: bool = False
    best_score: float | None = None
    attempts_used: int | None = None
    # None = unlimited.
    attempts_left: int | None = None
    # None = an attempt can start now.
    next_attempt_at: datetime | None = None
    open_attempt: SpaceAttempt | None = None


def attempt_state(item: SpaceItem, attempts: Sequence[SpaceAttempt], *, at: datetime) -> AttemptState:
    """The attempt state from the attempts of one user on one item (oldest first).

    An OPEN attempt past its deadline + grace counts as EXPIRED (lazy expiry, see space_attempt_service).
    It ended at its deadline, so the cooldown counts from there.

    Attempts started before `item.progress_reset_at` do not count (used, cooldown). An OPEN one is still
    found, so the start resumes it and never inserts a second open row.
    """
    open_attempt: SpaceAttempt | None = None
    last_finished: datetime | None = None
    used = 0
    for attempt in attempts:
        counts = item.progress_reset_at is None or attempt.started_at > item.progress_reset_at
        used += int(counts)
        if attempt.status == int(AttemptStatus.OPEN) and not is_past_grace(attempt, at=at):
            open_attempt = attempt
            continue
        ended = attempt.finished_at or attempt.deadline_at
        if counts and ended is not None and (last_finished is None or ended > last_finished):
            last_finished = ended
    left = None if item.max_attempts is None else max(item.max_attempts - used, 0)
    next_at = None
    if open_attempt is None and item.cooldown_hours is not None and last_finished is not None:
        ready = last_finished + timedelta(hours=item.cooldown_hours)
        next_at = ready if ready > at else None
    return AttemptState(attempts_used=used, attempts_left=left, next_attempt_at=next_at, open_attempt=open_attempt)


def item_states(db: Session, *, items: Sequence[SpaceItem], user_id: str) -> dict[str, AttemptState]:
    """The state of each published item for a VIEWER. Two queries for attempts and scores, one for completions."""
    item_ids = [i.id for i in items]
    done = space_item_completion_crud.list_completed_ids(db, user_id=user_id, item_ids=item_ids)
    tests = [i for i in items if i.kind == int(SpaceItemKind.TEST)]
    test_ids = [i.id for i in tests]
    attempts = space_attempt_crud.list_by_user_items(db, user_id=user_id, item_ids=test_ids)
    scores = test_result_crud.best_scores_by_item(db, user_id=user_id, item_ids=test_ids)
    at = utcnow()
    states: dict[str, AttemptState] = {}
    for item in items:
        if item.kind == int(SpaceItemKind.TEST):
            base = attempt_state(item, [a for a in attempts if a.item_id == item.id], at=at)
            states[item.id] = AttemptState(
                completed=item.id in done,
                best_score=scores.get(item.id),
                attempts_used=base.attempts_used,
                attempts_left=base.attempts_left,
                next_attempt_at=base.next_attempt_at,
                open_attempt=base.open_attempt,
            )
        else:
            states[item.id] = AttemptState(completed=item.id in done)
    return states


def course_progress(db: Session, *, space_ids: Sequence[str], user_id: str) -> dict[str, SpaceProgress]:
    """The progress per space for a VIEWER. Three queries."""
    totals = space_item_crud.count_published_by_space(db, space_ids=space_ids)
    done = space_item_completion_crud.count_by_space(db, user_id=user_id, space_ids=space_ids)
    members = {m.space_id: m for m in space_member_crud.list_for_user(db, user_id=user_id, space_ids=space_ids)}

    def build(space_id: str, total: int) -> SpaceProgress:
        completed = min(done.get(space_id, 0), total)
        member = members.get(space_id)
        return SpaceProgress(
            completed_items=completed,
            total_items=total,
            percent=round(100 * completed / total) if total else 0,
            last_item_id=member.last_item_id if member else None,
            completed_at=member.completed_at if member else None,
        )

    return {space_id: build(space_id, total) for space_id, total in totals.items()}


# ── Completion rules ──────────────────────────────────────────────────────────


def reaches_threshold(item: SpaceItem, best_score: float | None) -> bool:
    """The ONE pass rule: a graded best score (0..100) of at least `pass_threshold`. No score is no pass."""
    return best_score is not None and best_score / 100 >= item.pass_threshold


def recheck_test_completion(db: Session, *, item: SpaceItem, user_id: str) -> None:
    """Best score >= `pass_threshold` writes the completion row. A later low score never removes it.

    A result with an answer still being graded is not counted: call this again after
    `grade_pending_answers` and after a challenge recalculation.
    """
    best = test_result_crud.best_scores_by_item(db, user_id=user_id, item_ids=[item.id]).get(item.id)
    if not reaches_threshold(item, best):
        return
    space_item_completion_crud.add(db, item_id=item.id, user_id=user_id, completed_at=utcnow())
    sync_member_completion(db, space_id=item.space_id, user_id=user_id)


def recheck_result_completion(db: Session, *, test_result: TestResult) -> None:
    """`recheck_test_completion` for the item of a course result. Nothing for a personal result."""
    if test_result.space_item_id is None:
        return
    item = space_item_crud.get(db, item_id=test_result.space_item_id)
    if item is not None:
        recheck_test_completion(db, item=item, user_id=test_result.user_id)


def sync_member_completion(db: Session, *, space_id: str, user_id: str) -> None:
    """`space_member.completed_at` = set when the user is done with every published item, else cleared."""
    # Row lock: two parallel completions (a mark and a background grade) would each count one item
    # less and both write `completed_at = None`. The second waits and counts after the first commit.
    member = get_member_row(db, space_id=space_id, user_id=user_id, for_update=True)
    if member is None:
        return
    total = space_item_crud.count_published_by_space(db, space_ids=[space_id]).get(space_id, 0)
    done = space_item_completion_crud.count_by_space(db, user_id=user_id, space_ids=[space_id]).get(space_id, 0)
    is_done = total > 0 and done >= total
    if is_done and member.completed_at is None:
        member.completed_at = utcnow()
    elif not is_done:
        member.completed_at = None
    db.flush()


def sync_course_completion(db: Session, *, space_id: str) -> None:
    """The same for every member of the course (after a publish adds items, or resets them)."""
    total = space_item_crud.count_published_by_space(db, space_ids=[space_id]).get(space_id, 0)
    done_users = (
        space_item_completion_crud.list_users_done_all(db, space_id=space_id, total_items=total) if total else []
    )
    space_member_crud.sync_completed_at(db, space_id=space_id, done_user_ids=done_users, at=utcnow())


def answers_revealed(db: Session, *, item: SpaceItem, user_id: str) -> bool:
    """May this VIEWER see the answer key of the tests of `item`? Fail-closed: any unknown value says no.

    AFTER_PASS_OR_LAST: after the item is completed, or when no attempt is left (and none is open).
    """
    policy = item.reveal_answers
    if policy == int(RevealAnswers.ALWAYS):
        return True
    if policy != int(RevealAnswers.AFTER_PASS_OR_LAST):
        return False
    state = item_states(db, items=[item], user_id=user_id)[item.id]
    return state.completed or (state.attempts_left == 0 and state.open_attempt is None)
