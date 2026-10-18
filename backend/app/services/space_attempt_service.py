"""Course test attempts: start (or resume) and submit (see docs/spaces.md).

Only VIEWER members have attempt rows. Owner and editor get a preview: the exam of the first
variant, no rows, no limits. An archived course is read-only: no start, no submit.

The attempt pins the variant and the version of the test it started on. After a publish the live
test can be newer: the attempt then runs on the frozen copy (`test.parent_id` = live test,
`test.version` = the pinned number). The client keeps the ids of the first exam it got, so a
frozen exam is shown with the ids of the live questions (`origin_id`) and mapped back on submit.
"""

import random
from collections.abc import Sequence
from datetime import datetime, timedelta

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AttemptStatus, SpaceItemKind, SpaceRole
from app.crud import space_attempt as space_attempt_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_test as space_item_test_crud
from app.crud import space_member as space_member_crud
from app.crud import test as test_crud
from app.models.question import Question
from app.models.space import Space
from app.models.space_attempt import SpaceAttempt
from app.models.space_item import SpaceItem
from app.models.test import Test
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.question import QuestionReadStripped
from app.schemas.space import SpaceAttemptStart
from app.schemas.test import TestReadStripped
from app.services import space_progress_service
from app.services.correction_service import grade_submission
from app.services.grading_service import grade_pending_answers
from app.services.question_helpers import build_stripped_test
from app.services.space_service import (
    Membership,
    conflict,
    forbidden,
    get_course_or_404,
    get_membership,
    require_active,
)


def _get_published_test_item_or_404(db: Session, *, space: Space, item_id: str) -> SpaceItem:
    item = space_item_crud.get(db, item_id=item_id)
    if item is None or item.space_id != space.id or item.is_draft or item.kind != int(SpaceItemKind.TEST):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return item


def _all_questions(test: Test) -> list[Question]:
    return [*test.questions, *(q for g in test.question_groups for q in g.questions)]


def _pinned_test(db: Session, *, attempt: SpaceAttempt) -> Test:
    """The test content the attempt runs on: the live test when its version still matches, else the frozen copy."""
    live = test_crud.get_by_id(db, id=attempt.test_id, populate_existing=True)
    if live is not None and live.version == attempt.test_version:
        return live
    frozen = test_crud.get_snapshot(db, parent_id=attempt.test_id, version=attempt.test_version)
    if frozen is None:
        raise conflict("This attempt can not be continued")
    return frozen


def _present(test: Test, *, live_id: str) -> TestReadStripped:
    """The exam without answers. A frozen copy is shown with the ids of the live test and questions."""
    stripped = build_stripped_test(test)
    if test.id == live_id:
        return stripped
    question_ids = {q.id: q.origin_id for q in _all_questions(test) if q.origin_id}
    group_ids = {g.id: g.origin_id for g in test.question_groups if g.origin_id}

    def remap(question: QuestionReadStripped) -> QuestionReadStripped:
        return question.model_copy(
            update={
                "id": question_ids.get(question.id, question.id),
                "test_id": live_id if question.test_id else None,
                "group_id": group_ids.get(question.group_id, question.group_id) if question.group_id else None,
            }
        )

    return stripped.model_copy(
        update={
            "id": live_id,
            "questions": [remap(q) for q in stripped.questions],
            "question_groups": [
                g.model_copy(
                    update={
                        "id": group_ids.get(g.id, g.id),
                        "test_id": live_id,
                        "questions": [remap(q) for q in g.questions],
                    }
                )
                for g in stripped.question_groups
            ],
        }
    )


def _id_map_to_pinned(test: Test, *, live_id: str) -> dict[str, str] | None:
    """{id the client has: id in `test`} for a frozen copy. None for the live test."""
    if test.id == live_id:
        return None
    return {q.origin_id: q.id for q in _all_questions(test) if q.origin_id}


def _available_variants(db: Session, *, item: SpaceItem) -> list[Test]:
    ids = space_item_test_crud.list_by_items(db, item_ids=[item.id]).get(item.id, [])
    # `populate_existing`: show only the ACTIVE questions, also when this session loaded the test before a publish.
    tests = [test_crud.get_by_id(db, id=test_id, populate_existing=True) for test_id in ids]
    return [t for t in tests if t is not None and not t.is_draft]


def _pick_variant(db: Session, *, item: SpaceItem, user_id: str, variants: Sequence[Test]) -> Test:
    """The variant the user started least often. A random one among equals."""
    counts = space_attempt_crud.count_by_variant(db, user_id=user_id, item_id=item.id)
    fewest = min(counts.get(t.id, 0) for t in variants)
    return random.choice([t for t in variants if counts.get(t.id, 0) == fewest])


def _expire_stale(db: Session, *, attempts: Sequence[SpaceAttempt], at: datetime) -> None:
    """Lazy expiry (there is no scheduler): an OPEN attempt past deadline + grace becomes EXPIRED."""
    stale = [
        a for a in attempts if a.status == int(AttemptStatus.OPEN) and space_progress_service.is_past_grace(a, at=at)
    ]
    for attempt in stale:
        space_attempt_crud.close(
            db, attempt=attempt, status=AttemptStatus.EXPIRED, finished_at=attempt.deadline_at or at
        )


def _require_viewer(membership: Membership) -> None:
    if membership.role != SpaceRole.VIEWER:
        raise forbidden()


# ── Start ─────────────────────────────────────────────────────────────────────


def start_attempt(db: Session, *, space_id: str, item_id: str, current_user: User) -> SpaceAttemptStart:
    """VIEWER: start an attempt, or resume the open one. Author: a preview with no rows and no limits."""
    space = get_course_or_404(db, space_id=space_id)
    membership = get_membership(db, space=space, user=current_user)
    if membership.role is None:
        raise forbidden()
    item = _get_published_test_item_or_404(db, space=space, item_id=item_id)
    require_active(space)

    if membership.can_author:
        variants = _available_variants(db, item=item)
        if not variants:
            raise conflict("This test has no questions available")
        return SpaceAttemptStart(
            attempt_id=None, test=build_stripped_test(variants[0]), started_at=None, deadline_at=None
        )

    # The row lock serializes parallel starts of one user (a double click, two tabs).
    space_member_crud.get_for_update(db, space_id=space.id, user_id=current_user.id)
    at = space_progress_service.utcnow()
    attempts = space_attempt_crud.list_by_user_items(db, user_id=current_user.id, item_ids=[item.id])
    _expire_stale(db, attempts=attempts, at=at)
    state = space_progress_service.attempt_state(item, attempts, at=at)

    if state.open_attempt is not None:
        open_attempt = state.open_attempt
        # Build the exam before the commit: a commit expires the test, and a reload would show the retired questions.
        exam = _present(_pinned_test(db, attempt=open_attempt), live_id=open_attempt.test_id)
        started_at, deadline_at = open_attempt.started_at, open_attempt.deadline_at
        db.commit()
        return SpaceAttemptStart(
            attempt_id=open_attempt.id, test=exam, started_at=started_at, deadline_at=deadline_at, resumed=True
        )
    if state.attempts_left == 0:
        db.commit()
        raise conflict("No attempts left")
    if state.next_attempt_at is not None:
        db.commit()
        raise conflict(f"The next attempt is possible at {state.next_attempt_at.isoformat()}")

    variants = _available_variants(db, item=item)
    if not variants:
        db.commit()
        raise conflict("This test has no questions available")
    test = _pick_variant(db, item=item, user_id=current_user.id, variants=variants)
    deadline = at + timedelta(minutes=item.time_limit_minutes) if item.time_limit_minutes else None
    exam = build_stripped_test(test)
    attempt = space_attempt_crud.create(
        db,
        item_id=item.id,
        user_id=current_user.id,
        test_id=test.id,
        test_version=test.version,
        started_at=at,
        deadline_at=deadline,
    )
    attempt_id = attempt.id
    db.commit()
    return SpaceAttemptStart(attempt_id=attempt_id, test=exam, started_at=at, deadline_at=deadline)


# ── Submit ────────────────────────────────────────────────────────────────────


def submit_attempt(
    db: Session,
    *,
    space_id: str,
    attempt_id: str,
    current_user: User,
    submission: TestSubmission,
    background_tasks: BackgroundTasks,
) -> TestResult:
    """Grade the attempt against its pinned version, close it and check the completion."""
    space = get_course_or_404(db, space_id=space_id)
    attempt = space_attempt_crud.get(db, attempt_id=attempt_id, for_update=True)
    item = space_item_crud.get(db, item_id=attempt.item_id) if attempt is not None else None
    if attempt is None or item is None or attempt.user_id != current_user.id or item.space_id != space.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    _require_viewer(get_membership(db, space=space, user=current_user))
    require_active(space)
    if attempt.status != int(AttemptStatus.OPEN):
        raise conflict("This attempt is already closed")

    at = space_progress_service.utcnow()
    if space_progress_service.is_past_grace(attempt, at=at):
        space_attempt_crud.close(
            db, attempt=attempt, status=AttemptStatus.EXPIRED, finished_at=attempt.deadline_at or at
        )
        db.commit()
        raise conflict("Time is over")

    pinned = _pinned_test(db, attempt=attempt)
    result = grade_submission(
        db,
        test=pinned,
        current_user=current_user,
        submission=submission,
        space_item_id=item.id,
        question_id_map=_id_map_to_pinned(pinned, live_id=attempt.test_id),
    )
    space_attempt_crud.close(
        db, attempt=attempt, status=AttemptStatus.SUBMITTED, finished_at=at, test_result_id=result.id
    )
    space_progress_service.recheck_test_completion(db, item=item, user_id=current_user.id)
    db.commit()
    db.refresh(result)
    if result.pending_answers > 0:
        background_tasks.add_task(grade_pending_answers, result.id)
    return result
