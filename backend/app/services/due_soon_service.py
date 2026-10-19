"""The "due soon" scan, shared by the classroom "Due soon" list and the due-soon notification.

It imports no other service on purpose: `classroom_service` and `notification_service` both need it, and
`classroom_service` -> `space_draft_service` -> `notification_service` is already a chain (an import cycle
if this lived in `classroom_service`).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.crud import space as space_crud
from app.crud import space_content as space_content_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import space_item_test as space_item_test_crud
from app.crud import space_member as space_member_crud
from app.models.space import Space
from app.models.space_item import SpaceItem

DUE_SOON_WINDOW = timedelta(hours=24)


@dataclass(frozen=True)
class PendingDueItem:
    """One not-yet-done item due soon, with the title and the space it belongs to (used for the DueSoon list
    and for the due-soon notification, see `notification_service`)."""

    item: SpaceItem
    space: Space
    classroom_id: str
    title: str
    due_at: datetime


def pending_due_items(
    db: Session, *, classrooms: Sequence[Space], user_id: str, start: datetime, end: datetime
) -> list[PendingDueItem]:
    """Items due in `(start, end]` across these classrooms and their visible courses, not yet done by the student.

    One query per helper regardless of how many classrooms are given (`due_soon` passes one; the due-soon
    notification scan passes every classroom where the user is a student).
    """
    children = space_crud.list_children_for_parents(db, parent_ids=[c.id for c in classrooms])
    hidden = space_item_crud.list_hidden_course_ids(db, course_ids=[c.id for c in children])
    courses = [c for c in children if c.id not in hidden]
    spaces = {s.id: s for s in [*classrooms, *courses]}
    classroom_of = {c.id: c.id for c in classrooms} | {c.id: c.parent_id or c.id for c in courses}
    items = space_item_crud.list_due(db, space_ids=list(spaces), start=start, end=end)

    done = space_item_completion_crud.list_completed_ids(db, user_id=user_id, item_ids=[i.id for i in items])
    course_rows = space_member_crud.list_for_user(
        db, user_id=user_id, space_ids=[i.child_space_id for i in items if i.child_space_id]
    )
    done_courses = {r.space_id for r in course_rows if r.completed_at is not None}
    due_dates = {i.id: i.due_at for i in items if i.due_at is not None}
    pending = [
        i for i in items if i.id in due_dates and i.id not in done and (i.child_space_id or "") not in done_courses
    ]

    links = space_item_test_crud.list_by_items(db, item_ids=[i.id for i in pending])
    first_test = {item_id: tests[0] for item_id, tests in links.items() if tests}
    notes = {n.id: n.title for n in space_content_crud.list_notes(db, ids=[i.note_id for i in pending if i.note_id])}
    tests = {t.id: t.title for t in space_content_crud.list_tests(db, ids=list(first_test.values()))}

    def title_of(item: SpaceItem) -> str:
        if item.child_space_id is not None:
            return spaces[item.child_space_id].title if item.child_space_id in spaces else ""
        return notes.get(item.note_id or "") or tests.get(first_test.get(item.id, "")) or ""

    return [
        PendingDueItem(
            item=i,
            space=spaces[i.space_id],
            classroom_id=classroom_of[i.space_id],
            title=title_of(i),
            due_at=due_dates[i.id],
        )
        for i in pending
    ]
