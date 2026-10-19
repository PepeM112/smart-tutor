"""Gradebook of a classroom (ST-68 Phase B, R34). OWNER / EDITOR only.

Rows are the ACTIVE students. Columns are the published TEST items of the classroom and of its published
courses, plus one % column per course. The query count is fixed: it does not grow with the students.

Cell status, first rule that fits:
  PASSED       the completion row exists, or the best graded score reaches `pass_threshold`
  PENDING      a result has an answer in grading
  IN_PROGRESS  an attempt is open
  FAILED       the student started an attempt (or has a graded result) and none of the above
  NOT_STARTED  no attempt and no result

Results and attempts from before `progress_reset_at` of the item do not count (same rule as the progress).
The gradebook is not paged: a classroom has tens of students and the teacher needs the whole matrix.
"""

from sqlalchemy.orm import Session

from app.core.enums import GradeCellStatus
from app.crud import space as space_crud
from app.crud import space_attempt as space_attempt_crud
from app.crud import space_content as space_content_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import space_item_test as space_item_test_crud
from app.crud import space_member as space_member_crud
from app.crud import test_result as test_result_crud
from app.models.space_item import SpaceItem
from app.models.user import User
from app.schemas.classroom_grades import (
    GradebookCell,
    GradebookColumn,
    GradebookCourse,
    GradebookCourseProgress,
    GradebookRead,
    GradebookRow,
)
from app.services.space_progress_service import is_hidden, reaches_threshold, utcnow
from app.services.space_service import get_classroom_or_404, is_archived, require_author


def _status(
    *,
    item: SpaceItem,
    best_score: float | None,
    completed: bool,
    has_pending: bool,
    has_open: bool,
    attempts_used: int,
) -> GradeCellStatus:
    if completed or reaches_threshold(item, best_score):
        return GradeCellStatus.PASSED
    if has_pending:
        return GradeCellStatus.PENDING
    if has_open:
        return GradeCellStatus.IN_PROGRESS
    if attempts_used > 0 or best_score is not None:
        return GradeCellStatus.FAILED
    return GradeCellStatus.NOT_STARTED


def get_gradebook(db: Session, *, classroom_id: str, current_user: User) -> GradebookRead:
    classroom = get_classroom_or_404(db, space_id=classroom_id)
    require_author(db, space=classroom, user=current_user)
    now = utcnow()
    # An archived classroom is read-only: "Remove completion" would be refused with 409, so no button.
    archived = is_archived(db, space=classroom)

    # Published courses, in classwork order. A course with only a draft item is not in the gradebook.
    course_items = space_item_crud.list_published_course_items(db, space_id=classroom.id)
    course_ids = [i.child_space_id for i in course_items if i.child_space_id]
    courses = {c.id: c for c in space_crud.list_by_ids(db, ids=course_ids)}
    course_items = [i for i in course_items if i.child_space_id in courses]
    course_ids = [i.child_space_id for i in course_items if i.child_space_id]

    items = list(space_item_crud.list_published_tests(db, space_ids=[classroom.id, *course_ids]))
    # Loose items first, then the items of each course in the order of the course.
    rank = {classroom.id: -1, **{cid: n for n, cid in enumerate(course_ids)}}
    items.sort(key=lambda i: rank.get(i.space_id, len(rank)))
    item_ids = [i.id for i in items]

    students = space_member_crud.list_active_students(db, space_id=classroom.id)
    user_ids = [user.id for _member, user in students]

    # Titles: a TEST item has no title. It shows the title of its first variant.
    links = space_item_test_crud.list_by_items(db, item_ids=item_ids)
    first_test = {item_id: tests[0] for item_id, tests in links.items() if tests}
    test_titles = {t.id: t.title for t in space_content_crud.list_tests(db, ids=list(first_test.values()))}

    best = test_result_crud.best_results_by_user_item(db, user_ids=user_ids, item_ids=item_ids)
    pending = test_result_crud.pending_pairs(db, user_ids=user_ids, item_ids=item_ids)
    overridden = test_result_crud.overridden_pairs(db, user_ids=user_ids, item_ids=item_ids)
    attempts = space_attempt_crud.usage_by_user_item(db, item_ids=item_ids)
    completed = space_item_completion_crud.list_completed_pairs(db, item_ids=item_ids)
    done_by_course = space_item_completion_crud.count_by_user_and_space(db, space_ids=course_ids)
    totals = space_item_crud.count_published_by_space(db, space_ids=course_ids)

    columns = [
        GradebookColumn(
            item_id=i.id,
            title=test_titles.get(first_test.get(i.id, ""), ""),
            course_id=i.space_id if i.space_id != classroom.id else None,
            pass_threshold=i.pass_threshold,
            max_attempts=i.max_attempts,
            due_at=i.due_at,
            hidden=is_hidden(i, at=now),
        )
        for i in items
    ]
    course_columns = [
        GradebookCourse(
            course_id=item.child_space_id,
            title=courses[item.child_space_id].title,
            hidden=is_hidden(item, at=now),
            total_items=totals.get(item.child_space_id, 0),
        )
        for item in course_items
        if item.child_space_id
    ]

    def cell(user_id: str, item: SpaceItem) -> GradebookCell:
        pair = (user_id, item.id)
        result_id, score = best.get(pair, (None, None))
        used, has_open = attempts.get(pair, (0, False))
        return GradebookCell(
            item_id=item.id,
            status=_status(
                item=item,
                best_score=score,
                completed=pair in completed,
                has_pending=pair in pending,
                has_open=has_open,
                attempts_used=used,
            ),
            best_score=score,
            attempts_used=used,
            best_result_id=result_id,
            overridden=pair in overridden,
            can_undo_pass=not archived and pair in completed and not reaches_threshold(item, score),
        )

    def course_progress(user_id: str, course_id: str) -> GradebookCourseProgress:
        total = totals.get(course_id, 0)
        done = min(done_by_course.get((user_id, course_id), 0), total)
        return GradebookCourseProgress(
            course_id=course_id, completed_items=done, percent=round(100 * done / total) if total else 0
        )

    rows = [
        GradebookRow(
            user_id=user.id,
            username=user.username,
            display_name=getattr(user, "display_name", None),
            cells=[cell(user.id, i) for i in items],
            courses=[course_progress(user.id, c.course_id) for c in course_columns],
        )
        for _member, user in students
    ]
    return GradebookRead(columns=columns, courses=course_columns, rows=rows)
