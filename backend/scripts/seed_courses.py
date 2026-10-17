"""Seed courses (Spaces M2) for browser testing — runs after seed.py.

Usage: python seed_courses.py <owner_email> <editor_email> <viewer_email> <outsider_email>
Runs inside the backend container via seed_courses.sh (PYTHONPATH=/app).

It uses the services, not raw SQL, so publish, twins and the join rules run as in the app.
"""

import logging
import sys

from seed_data.clean import clean_user_spaces
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import SpaceItemKind, SpaceRole, SpaceVisibility
from app.database import SessionLocal
from app.models.note import Note
from app.models.space import Space
from app.models.test import Test
from app.models.user import User
from app.schemas.space import (
    SpaceCreate,
    SpaceItemCopy,
    SpaceItemCreate,
    SpacePublishRequest,
    SpaceSectionCreate,
)
from app.services import space_draft_service, space_member_service, space_service

logging.disable(logging.DEBUG)


def get_user(db: Session, email: str) -> User:
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None:
        print(f"user {email} not found")
        sys.exit(1)
    return user


def personal_note(db: Session, user: User, title: str) -> Note:
    note = db.scalars(select(Note).where(Note.user_id == user.id, Note.space_id.is_(None), Note.title == title)).first()
    if note is None:
        print(f"note '{title}' not found: run `make seed` first")
        sys.exit(1)
    return note


def personal_test(db: Session, user: User, title: str) -> Test:
    test = db.scalars(select(Test).where(Test.user_id == user.id, Test.space_id.is_(None), Test.title == title)).first()
    if test is None:
        print(f"test '{title}' not found: run `make seed` first")
        sys.exit(1)
    return test


def create(db: Session, owner: User, title: str, description: str, visibility: SpaceVisibility, tags: list[str]) -> str:
    data = SpaceCreate(title=title, description=description, visibility=visibility, tags=tags)
    return space_service.create_course(db, current_user=owner, data=data).id


def add_section(db: Session, owner: User, space_id: str, title: str) -> str:
    detail = space_draft_service.add_section(
        db, space_id=space_id, current_user=owner, data=SpaceSectionCreate(title=title)
    )
    # SAFETY: a course in edit mode always returns draft_sections.
    assert detail.draft_sections is not None
    return detail.draft_sections[-1].id


def new_note(db: Session, owner: User, space_id: str, section_id: str, title: str, content: str) -> None:
    data = SpaceItemCreate(section_id=section_id, kind=SpaceItemKind.NOTE, title=title)
    item = space_draft_service.create_item(db, space_id=space_id, current_user=owner, data=data)
    note = db.get(Note, item.note_id)
    assert note is not None
    note.content = content
    db.commit()


def publish(db: Session, owner: User, space_id: str, message: str) -> None:
    space_draft_service.publish(db, space_id=space_id, current_user=owner, data=SpacePublishRequest(message=message))


def add_member(db: Session, owner: User, space_id: str, user: User, role: SpaceRole) -> None:
    """Invite, then accept as the user: the same path as the UI."""
    space_member_service.invite(db, space_id=space_id, current_user=owner, identifier=user.username)
    space_member_service.accept_invitation(db, space_id=space_id, current_user=user)
    if role == SpaceRole.EDITOR:
        space_member_service.set_role(db, space_id=space_id, user_id=user.id, current_user=owner, role=role)


def seed_spanish(db: Session, owner: User, editor: User, viewer: User) -> str:
    """PUBLIC, published, then left in edit mode with a changed note and a new section."""
    space_id = create(
        db, owner, "Spanish Basics", "Verbs and vocabulary for beginners.", SpaceVisibility.PUBLIC, ["spanish"]
    )
    grammar = add_section(db, owner, space_id, "Grammar")
    practice = add_section(db, owner, space_id, "Practice")
    note = personal_note(db, owner, "Spanish Verb Conjugations")
    test = personal_test(db, owner, "Spanish Vocabulary")
    space_draft_service.copy_item(
        db, space_id=space_id, current_user=owner, data=SpaceItemCopy(section_id=grammar, note_id=note.id)
    )
    new_note(db, owner, space_id, grammar, "Pronouns", "# Pronouns\n\nyo, tú, él / ella, nosotros, vosotros, ellos.")
    space_draft_service.copy_item(
        db, space_id=space_id, current_user=owner, data=SpaceItemCopy(section_id=practice, test_id=test.id)
    )
    publish(db, owner, space_id, "First version")
    add_member(db, owner, space_id, editor, SpaceRole.EDITOR)
    add_member(db, owner, space_id, viewer, SpaceRole.VIEWER)

    # Edit mode with unpublished changes: members must still see "First version".
    detail = space_draft_service.enter_edit_mode(db, space_id=space_id, current_user=owner)
    assert detail.draft_sections is not None
    pronouns_item = detail.draft_sections[0].items[1]
    twin = space_draft_service.make_editable(db, space_id=space_id, item_id=pronouns_item.id, current_user=owner)
    twin_note = db.get(Note, twin.note_id)
    assert twin_note is not None
    twin_note.content += "\n\n**DRAFT CHANGE:** members must not see this line before publish."
    db.commit()
    extra = add_section(db, owner, space_id, "Extra (draft only)")
    new_note(db, owner, space_id, extra, "Irregular verbs", "# Irregular verbs\n\nser, ir, tener.")
    return space_id


def seed_geography(db: Session, owner: User, viewer: User) -> str:
    """UNLISTED, published: not in the catalog, join by link or code."""
    space_id = create(
        db, owner, "World Geography", "Capitals and flags, unlisted.", SpaceVisibility.UNLISTED, ["geography"]
    )
    section = add_section(db, owner, space_id, "Overview")
    test = personal_test(db, owner, "World Geography")
    space_draft_service.copy_item(
        db, space_id=space_id, current_user=owner, data=SpaceItemCopy(section_id=section, test_id=test.id)
    )
    publish(db, owner, space_id, "Initial")
    add_member(db, owner, space_id, viewer, SpaceRole.VIEWER)
    return space_id


def seed_private(db: Session, owner: User, viewer: User, outsider: User) -> str:
    """PRIVATE, published: the outsider has a join request, the viewer has an invitation."""
    space_id = create(db, owner, "Private Study Group", "Invite only.", SpaceVisibility.PRIVATE, [])
    section = add_section(db, owner, space_id, "Week 1")
    new_note(db, owner, space_id, section, "Welcome", "# Welcome\n\nOnly members can read this.")
    publish(db, owner, space_id, "Week 1")
    space_member_service.join(db, space_id=space_id, current_user=outsider)
    space_member_service.invite(db, space_id=space_id, current_user=owner, identifier=viewer.email)
    return space_id


def seed_unpublished(db: Session, owner: User) -> str:
    """Never published: no catalog, no joins (409)."""
    space_id = create(db, owner, "Draft Course", "Not published yet.", SpaceVisibility.PUBLIC, [])
    section = add_section(db, owner, space_id, "Coming soon")
    new_note(db, owner, space_id, section, "Outline", "# Outline\n\nTo do.")
    return space_id


def seed_archived(db: Session, owner: User, viewer: User) -> str:
    """PUBLIC, published, then archived: members read, nobody edits or joins."""
    space_id = create(db, owner, "Old Course", "Archived course.", SpaceVisibility.PUBLIC, [])
    section = add_section(db, owner, space_id, "Archive")
    new_note(db, owner, space_id, section, "Old notes", "# Old notes\n\nRead-only now.")
    publish(db, owner, space_id, "Final")
    add_member(db, owner, space_id, viewer, SpaceRole.VIEWER)
    space_service.set_archived(db, space_id=space_id, current_user=owner, archived=True)
    return space_id


def seed_other_owner(db: Session, editor: User) -> str:
    """A PUBLIC course of another user: the main user sees it in the catalog as a non-member."""
    space_id = create(
        db, editor, "Intro to Chemistry", "A course by another user.", SpaceVisibility.PUBLIC, ["science"]
    )
    section = add_section(db, editor, space_id, "Atoms")
    new_note(db, editor, space_id, section, "The atom", "# The atom\n\nProtons, neutrons, electrons.")
    publish(db, editor, space_id, "v1")
    return space_id


owner_email, editor_email, viewer_email, outsider_email = sys.argv[1:5]
db = SessionLocal()
owner, editor, viewer, outsider = (get_user(db, e) for e in (owner_email, editor_email, viewer_email, outsider_email))

print("Cleaning previous courses... ", end="", flush=True)
for user in (owner, editor, viewer, outsider):
    clean_user_spaces(db, user)
print("done")

print("Creating courses... ", end="", flush=True)
ids = {
    "Spanish Basics": seed_spanish(db, owner, editor, viewer),
    "World Geography": seed_geography(db, owner, viewer),
    "Private Study Group": seed_private(db, owner, viewer, outsider),
    "Draft Course": seed_unpublished(db, owner),
    "Old Course": seed_archived(db, owner, viewer),
    "Intro to Chemistry": seed_other_owner(db, editor),
}
print("done\n")

for title, space_id in ids.items():
    space = db.get(Space, space_id)
    assert space is not None
    print(f"{title:22} /courses/{space_id}   code: {space.join_code}")
db.close()
