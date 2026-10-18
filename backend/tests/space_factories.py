"""Row factories for the space DB tests. There are no space endpoints yet (M1), so rows are inserted directly.

Each factory flushes, and `commit()` saves them: `execute_tool` rolls back the session on an error,
and that must not remove the test data (with `create_savepoint`, a commit only releases a SAVEPOINT).
"""

from datetime import datetime

from sqlalchemy.orm import Session
from ulid import ULID

from app.core.enums import MemberStatus, SpaceItemKind, SpaceKind, SpaceRole, SpaceStatus
from app.models.note import Note
from app.models.question import Question
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_item_test import SpaceItemTest
from app.models.space_member import SpaceMember
from app.models.space_section import SpaceSection
from app.models.test import Test
from app.models.user import User


def new_user(db: Session) -> User:
    tag = str(ULID()).lower()
    user = User(username=f"dbtest-{tag}", email=f"dbtest-{tag}@example.com", hashed_password="x")
    db.add(user)
    db.flush()
    return user


def new_space(
    db: Session,
    *,
    owner: User,
    kind: SpaceKind = SpaceKind.COURSE,
    parent: Space | None = None,
    space_status: SpaceStatus = SpaceStatus.ACTIVE,
) -> Space:
    space = Space(
        kind=int(kind),
        owner_id=owner.id,
        title="Space",
        parent_id=parent.id if parent else None,
        status=int(space_status),
    )
    db.add(space)
    db.flush()
    return space


def add_member(
    db: Session, *, space: Space, user: User, role: SpaceRole, member_status: MemberStatus = MemberStatus.ACTIVE
) -> None:
    db.add(SpaceMember(space_id=space.id, user_id=user.id, role=int(role), status=int(member_status)))
    db.flush()


def new_note(
    db: Session, *, user: User, space: Space | None = None, is_draft: bool = False, content: str = "cells"
) -> Note:
    note = Note(user_id=user.id, title="Note", content=content, space_id=space.id if space else None, is_draft=is_draft)
    db.add(note)
    db.flush()
    return note


def new_test(db: Session, *, user: User, space: Space | None = None, is_draft: bool = False) -> Test:
    """A test with one SIMPLE question."""
    test = Test(user_id=user.id, title="Test", space_id=space.id if space else None, is_draft=is_draft)
    db.add(test)
    db.flush()
    db.add(Question(user_id=user.id, test_id=test.id, prompt="to go", content={"answers": ["ir"]}))
    db.flush()
    db.refresh(test)
    return test


def new_bank_question(db: Session, *, user: User) -> Question:
    question = Question(user_id=user.id, test_id=None, prompt="bank", content={"answers": ["a"]})
    db.add(question)
    db.flush()
    return question


def new_section(db: Session, *, space: Space, is_draft: bool = False) -> SpaceSection:
    section = SpaceSection(space_id=space.id, title="Section", position=0, is_draft=is_draft)
    db.add(section)
    db.flush()
    return section


def new_item(
    db: Session,
    *,
    space: Space,
    kind: SpaceItemKind,
    note: Note | None = None,
    test: Test | None = None,
    child: Space | None = None,
    is_draft: bool = False,
    visible_from: datetime | None = None,
    due_at: datetime | None = None,
    opens_at: datetime | None = None,
    closes_at: datetime | None = None,
    time_limit_minutes: int | None = None,
) -> SpaceItem:
    """A published item (or a draft one) in a new section. A TEST item links `test` as variant 0."""
    section = new_section(db, space=space, is_draft=is_draft)
    item = SpaceItem(
        space_id=space.id,
        section_id=section.id,
        kind=int(kind),
        note_id=note.id if note else None,
        child_space_id=child.id if child else None,
        position=0,
        is_draft=is_draft,
        visible_from=visible_from,
        due_at=due_at,
        opens_at=opens_at,
        closes_at=closes_at,
        time_limit_minutes=time_limit_minutes,
    )
    db.add(item)
    db.flush()
    if test is not None:
        db.add(SpaceItemTest(item_id=item.id, test_id=test.id, position=0))
        db.flush()
    return item


def link_course(db: Session, *, classroom: Space, course: Space, visible_from: datetime | None = None) -> SpaceItem:
    """A published COURSE item: students of the classroom can reach the course."""
    return new_item(db, space=classroom, kind=SpaceItemKind.COURSE, child=course, visible_from=visible_from)
