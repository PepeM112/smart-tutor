"""Copy-on-write versioning for tests.

When a test that has results is mutated (edit, delete, reorder), we clone the
current state into a frozen version *before* applying the changes.  Existing
results and their answers are repointed to the frozen copy so they remain
stable against future edits.

This module bypasses the CRUD layer intentionally: versioning is a cross-cutting
operation spanning Test, Question, TestQuestionGroup, TestResult, and Answer.
Routing through 5 separate CRUDs would fragment a cohesive transaction with no
readability benefit.  See PATTERNS.md for this exception.
"""

import copy

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.crud import test as test_crud
from app.models.answer import Answer
from app.models.question import Question
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup
from app.models.test_result import TestResult

# ---------------------------------------------------------------------------
# Public API — called by test_service and question_service before mutations
# ---------------------------------------------------------------------------


def version_test_if_needed(db: Session, *, test: Test, force: bool = False) -> bool:
    """Clone the test into a frozen version if it has any results.

    `force`: clone also when there are no results. A course publish needs it: an open attempt
    (no result yet) is graded against the version it started on, so that version must exist.

    Returns True if a frozen version was created, False otherwise.
    """
    has_results = db.execute(select(TestResult.id).where(TestResult.test_id == test.id).limit(1)).first()
    if not has_results and not force:
        return False

    # Re-fetch with eager loading so the snapshot only includes active questions/groups,
    # even when the session already holds this test with unfiltered collections.
    loaded = test_crud.get_by_id(db, id=test.id, populate_existing=True)
    if loaded is None:
        return False

    # A space test keeps its space, so its old results still pass the access check.
    # `is_draft` stays False: only published tests have results.
    frozen_test, question_id_map = clone_test(
        db,
        test=loaded,
        user_id=loaded.user_id,
        parent_id=test.id,
        space_id=loaded.space_id,
        source_note_id=loaded.source_note_id,
        link_origin=True,
    )
    _repoint_results(db, canonical_id=test.id, frozen_id=frozen_test.id, question_id_map=question_id_map)
    test.version += 1
    db.flush()
    return True


# ---------------------------------------------------------------------------
# Step 1: Clone — snapshot current test state into a frozen copy
# ---------------------------------------------------------------------------


def clone_test(
    db: Session,
    *,
    test: Test,
    user_id: str,
    parent_id: str | None,
    space_id: str | None,
    source_note_id: str | None,
    link_origin: bool,
    is_draft: bool = False,
    draft_of_id: str | None = None,
) -> tuple[Test, dict[str, str]]:
    """Deep-clone a test with its ACTIVE questions and groups (load it with `test_crud.get_by_id`).

    One function for every copy of a test:
    - Frozen version: `parent_id` = the canonical test (star topology), `link_origin=True`.
    - Space draft twin, copy into a space, duplicate of a course: `link_origin=False`, because a
      copy has no link to its source (see docs/spaces.md).

    `user_id` is the creator of the copy (questions and groups too). Frozen copies keep the creator.
    Returns (clone, {source_question_id: clone_question_id}).
    """
    frozen_test = Test(
        title=test.title,
        description=test.description,
        user_id=user_id,
        status=test.status,
        source_note_id=source_note_id,
        version=test.version,
        parent_id=parent_id,
        space_id=space_id,
        is_draft=is_draft,
        draft_of_id=draft_of_id,
    )
    db.add(frozen_test)
    db.flush()

    # Clone groups first — questions reference groups by ID
    group_id_map: dict[str, str] = {}
    for group in test.question_groups:
        frozen_group = TestQuestionGroup(
            test_id=frozen_test.id,
            type=group.type,
            order=group.order,
            title=group.title,
            points=group.points,
            status=group.status,
            origin_id=group.id if link_origin else None,
        )
        db.add(frozen_group)
        db.flush()
        group_id_map[group.id] = frozen_group.id

    # Clone questions — standalone (test.questions) and grouped (group.questions).
    # Grouped questions keep test_id=None to match the original data model and
    # avoid violating the (test_id, order) unique constraint.
    question_id_map: dict[str, str] = {}
    all_questions = list(test.questions) + [q for g in test.question_groups for q in g.questions]
    seen: set[str] = set()
    for question in all_questions:
        if question.id in seen:
            continue
        seen.add(question.id)

        frozen_group_id = group_id_map.get(question.group_id) if question.group_id else None
        frozen_q = Question(
            user_id=question.user_id if link_origin else user_id,
            question_type=question.question_type,
            prompt=question.prompt,
            content=copy.deepcopy(question.content),
            hint=question.hint,
            explanation=question.explanation,
            test_id=frozen_test.id if not frozen_group_id else None,
            group_id=frozen_group_id,
            order=question.order,
            points=question.points,
            status=question.status,
            origin_id=question.id if link_origin else None,
        )
        db.add(frozen_q)
        db.flush()
        question_id_map[question.id] = frozen_q.id

    return frozen_test, question_id_map


# ---------------------------------------------------------------------------
# Step 2: Repoint — move existing results/answers to the frozen copy
# ---------------------------------------------------------------------------


def _repoint_results(
    db: Session,
    *,
    canonical_id: str,
    frozen_id: str,
    question_id_map: dict[str, str],
) -> None:
    """Move all results (and their answers) from the canonical test to the frozen copy."""
    result_ids = list(db.scalars(select(TestResult.id).where(TestResult.test_id == canonical_id)).all())
    if not result_ids:
        return

    # Repoint TestResult.test_id → frozen test
    db.execute(update(TestResult).where(TestResult.test_id == canonical_id).values(test_id=frozen_id))

    # Repoint Answer.question_id → frozen question (one UPDATE per question)
    for old_q_id, new_q_id in question_id_map.items():
        db.execute(
            update(Answer)
            .where(
                Answer.test_result_id.in_(result_ids),
                Answer.question_id == old_q_id,
            )
            .values(question_id=new_q_id)
        )

    db.flush()
