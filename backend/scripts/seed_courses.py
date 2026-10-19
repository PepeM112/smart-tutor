"""Seed courses (Spaces M2) for browser testing — runs after seed.py.

Usage: python seed_courses.py <owner_email> <editor_email> <viewer_email> <outsider_email>
Runs inside the backend container via seed_courses.sh (PYTHONPATH=/app).

It uses the services, not raw SQL, so publish, twins and the join rules run as in the app.
"""

import logging
import sys
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks
from seed_data.clean import clean_user_spaces
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus, QuestionType, RevealAnswers, SpaceItemKind, SpaceRole, SpaceVisibility
from app.database import SessionLocal
from app.models.answer import Answer
from app.models.note import Note
from app.models.question import Question
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_item_test import SpaceItemTest
from app.models.test import Test
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.space import (
    ClassroomCourseCreate,
    ClassroomCreate,
    SpaceCreate,
    SpaceItemCopy,
    SpaceItemCreate,
    SpaceItemUpdate,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceVariantCreate,
)
from app.schemas.space_feed import SpaceCommentCreate, SpacePostCreate
from app.services import (
    classroom_service,
    space_attempt_service,
    space_draft_service,
    space_feed_service,
    space_member_service,
    space_service,
)
from app.services.versioning_service import version_test_if_needed

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


def add_question(db: Session, owner: User, test_id: str, prompt: str, answer: str, order: int = 0) -> None:
    question = Question(
        user_id=owner.id,
        test_id=test_id,
        question_type=QuestionType.SIMPLE,
        prompt=prompt,
        content={"answers": [answer]},
        order=order,
    )
    db.add(question)
    db.commit()


LONG_NOTE_SECTIONS = 40


def long_note_content() -> str:
    """Markdown taller than any screen: the end-of-note sentinel is far below the fold."""
    body = "\n\n".join(
        f"## Part {n}\n\nThis paragraph is filler text for part {n}. It only makes the note long, so the student "
        "must scroll to read the end of it. " * 3
        for n in range(1, LONG_NOTE_SECTIONS + 1)
    )
    return f"# Long note\n\n{body}\n\nEnd of the long note."


def seed_progress(db: Session, owner: User, viewer: User) -> str:
    """PUBLIC, published: two notes (one long) and a test item with 2 variants, for the progress and attempt specs.

    The test item: 2 attempts, 30 minutes, reveal AFTER_PASS_OR_LAST. Variant A asks for "alpha", variant B
    for "beta", so a spec can tell which variant an attempt got.
    """
    space_id = create(db, owner, "Progress Course", "Notes and a test with 2 variants.", SpaceVisibility.PUBLIC, [])
    section = add_section(db, owner, space_id, "Unit 1")
    new_note(db, owner, space_id, section, "Intro note", "# Intro note\n\nRead this note, then take the quiz.")
    new_note(db, owner, space_id, section, "Long note", long_note_content())
    first = space_draft_service.create_item(
        db,
        space_id=space_id,
        current_user=owner,
        data=SpaceItemCreate(section_id=section, kind=SpaceItemKind.TEST, title="Unit quiz A"),
    )
    assert first.test_id is not None
    add_question(db, owner, first.test_id, "Variant A: type alpha", "alpha")
    second = space_draft_service.add_variant(
        db,
        space_id=space_id,
        item_id=test_item_id(db, space_id),
        current_user=owner,
        data=SpaceVariantCreate(title="Unit quiz B"),
    )
    assert second.test_id is not None
    add_question(db, owner, second.test_id, "Variant B: type beta", "beta")
    policy = SpaceItemUpdate(
        pass_threshold=0.5, max_attempts=2, time_limit_minutes=30, reveal_answers=RevealAnswers.AFTER_PASS_OR_LAST
    )
    space_draft_service.update_item(
        db, space_id=space_id, item_id=test_item_id(db, space_id), current_user=owner, data=policy
    )
    publish(db, owner, space_id, "Initial")
    add_member(db, owner, space_id, viewer, SpaceRole.VIEWER)
    return space_id


def test_item_id(db: Session, space_id: str) -> str:
    item = db.scalars(
        select(SpaceItem).where(SpaceItem.space_id == space_id, SpaceItem.kind == int(SpaceItemKind.TEST))
    ).first()
    assert item is not None
    return item.id


OLDER_VERSION_TEST = "Older version test"


def clean_older_version_test(db: Session, user: User) -> None:
    """Delete the personal test of `seed_older_version_result`, its snapshot and its results (idempotent).

    The snapshot keeps the first title and the edited test ends with "(edited)", so one LIKE finds both.
    It does not use `clean_user_data`: that would delete all personal data of the user.
    """
    params = {"uid": user.id, "title": f"{OLDER_VERSION_TEST}%"}
    tests = "SELECT id FROM test WHERE user_id = :uid AND space_id IS NULL AND title LIKE :title"
    results = f"SELECT id FROM test_result WHERE test_id IN ({tests})"
    db.execute(text(f"DELETE FROM answer WHERE test_result_id IN ({results})"), params)
    db.execute(text(f"DELETE FROM test_result WHERE test_id IN ({tests})"), params)
    db.execute(text(f"DELETE FROM question WHERE test_id IN ({tests})"), params)
    db.execute(text("DELETE FROM test WHERE user_id = :uid AND space_id IS NULL AND title LIKE :title"), params)
    db.commit()


def seed_older_version_result(db: Session, viewer: User) -> None:
    """A personal test of the viewer with one result, then an edit of the test.

    The edit goes through `version_test_if_needed`, so the result points to a frozen snapshot and the
    results table shows the "older version" icon. A personal test is used on purpose: a result on a course
    test would use an attempt of the Progress Course and change its "attempts left".
    """
    clean_older_version_test(db, viewer)
    test = Test(title=OLDER_VERSION_TEST, description="Edited after its first result.", user_id=viewer.id)
    db.add(test)
    db.flush()
    question = Question(
        user_id=viewer.id,
        question_type=int(QuestionType.SIMPLE),
        prompt="Type gamma",
        content={"answers": ["gamma"]},
        test_id=test.id,
        order=1,
        points=1.0,
    )
    db.add(question)
    db.flush()
    db.add(
        TestResult(
            test_id=test.id,
            user_id=viewer.id,
            total_questions=1,
            correct_answers=1,
            pending_answers=0,
            earned_points=1.0,
            total_points=1.0,
            score=100.0,
            answers=[Answer(question_id=question.id, user_answer="gamma", status=int(AnswerStatus.CORRECT))],
        )
    )
    db.flush()
    # The edit: the result keeps the old content in the snapshot, the canonical test changes.
    version_test_if_needed(db, test=test)
    test.title = f"{OLDER_VERSION_TEST} (edited)"
    question.prompt = "Type gamma (edited)"
    db.commit()


def seed_other_owner(db: Session, editor: User) -> str:
    """A PUBLIC course of another user: the main user sees it in the catalog as a non-member."""
    space_id = create(
        db, editor, "Intro to Chemistry", "A course by another user.", SpaceVisibility.PUBLIC, ["science"]
    )
    section = add_section(db, editor, space_id, "Atoms")
    new_note(db, editor, space_id, section, "The atom", "# The atom\n\nProtons, neutrons, electrons.")
    publish(db, editor, space_id, "v1")
    return space_id


CLASSROOM_TITLE = "Biology 101"
CLASSROOM_CODE = "bio1010"
CELL_QUIZ = "Cell quiz"
WINDOWED_TEST = "Genetics exam"
HIDDEN_NOTE = "Surprise note"
COURSE_TITLE = "Cell Lab"


def item_of_test(db: Session, test_id: str) -> str:
    """The id of the (draft) item that holds the test."""
    link = db.scalars(select(SpaceItemTest).where(SpaceItemTest.test_id == test_id)).first()
    assert link is not None
    return link.item_id


def new_test_item(
    db: Session, owner: User, space_id: str, section_id: str, title: str, questions: list[tuple[str, str]]
) -> str:
    """A new TEST item with simple questions. Returns the item id."""
    content = space_draft_service.create_item(
        db,
        space_id=space_id,
        current_user=owner,
        data=SpaceItemCreate(section_id=section_id, kind=SpaceItemKind.TEST, title=title),
    )
    assert content.test_id is not None
    for order, (prompt, answer) in enumerate(questions):
        add_question(db, owner, content.test_id, prompt, answer, order)
    return item_of_test(db, content.test_id)


def set_policy(db: Session, owner: User, space_id: str, item_id: str, policy: SpaceItemUpdate) -> None:
    space_draft_service.update_item(db, space_id=space_id, item_id=item_id, current_user=owner, data=policy)


def seed_classroom(db: Session, owner: User, editor: User, viewer: User) -> str:
    """UNLISTED classroom with a fixed join code: loose classwork, a scheduled item, a windowed test, a course.

    Owner: reviewer. Co-teacher: editor. Student: viewer (with one failed result on the Cell quiz). Outsider: none.
    """
    now = datetime.now(timezone.utc)
    detail = classroom_service.create_classroom(
        db,
        current_user=owner,
        data=ClassroomCreate(
            title=CLASSROOM_TITLE, description="Cells, genetics and a lab course.", visibility=SpaceVisibility.UNLISTED
        ),
    )
    classroom_id = detail.id
    # A fixed code, so a spec can join by code.
    classroom = db.get(Space, classroom_id)
    assert classroom is not None
    classroom.join_code = CLASSROOM_CODE
    db.commit()

    week = add_section(db, owner, classroom_id, "Week 1")
    new_note(db, owner, classroom_id, week, "Cell basics", "# Cell basics\n\nThe cell is the unit of life.")
    # Due in 12 h, pass at 80 %: the student fails with one right answer of two, so it stays in "Due soon".
    quiz = new_test_item(
        db,
        owner,
        classroom_id,
        week,
        CELL_QUIZ,
        [("Type mitochondria", "mitochondria"), ("Type nucleus", "nucleus")],
    )
    set_policy(db, owner, classroom_id, quiz, SpaceItemUpdate(pass_threshold=0.8, due_at=now + timedelta(hours=12)))
    # Not open yet: the window starts in 3 days.
    exam = new_test_item(db, owner, classroom_id, week, WINDOWED_TEST, [("Type dna", "dna")])
    set_policy(
        db,
        owner,
        classroom_id,
        exam,
        SpaceItemUpdate(opens_at=now + timedelta(days=3), closes_at=now + timedelta(days=5)),
    )
    # Hidden from the student until next week.
    new_note(db, owner, classroom_id, week, HIDDEN_NOTE, "# Surprise\n\nStudents can not read this yet.")
    hidden = db.scalars(select(SpaceItem).where(SpaceItem.space_id == classroom_id, SpaceItem.is_draft.is_(True))).all()
    surprise = db.scalars(select(Note).where(Note.title == HIDDEN_NOTE, Note.space_id == classroom_id)).one()
    hidden_item = next(i for i in hidden if i.note_id == surprise.id)
    set_policy(db, owner, classroom_id, hidden_item.id, SpaceItemUpdate(visible_from=now + timedelta(days=7)))

    # A classroom course with a note and a test.
    lab = add_section(db, owner, classroom_id, "Lab")
    course = classroom_service.add_course(
        db,
        classroom_id=classroom_id,
        current_user=owner,
        data=ClassroomCourseCreate(title=COURSE_TITLE, description="Microscope work.", section_id=lab),
    )
    unit = add_section(db, owner, course.id, "Safety")
    new_note(db, owner, course.id, unit, "Lab safety", "# Lab safety\n\nWear gloves.")
    new_test_item(db, owner, course.id, unit, "Lab quiz", [("Type gloves", "gloves")])
    # The course publishes on its own, then the classroom.
    publish(db, owner, course.id, "Lab v1")
    publish(db, owner, classroom_id, "Week 1")

    add_member(db, owner, classroom_id, editor, SpaceRole.EDITOR)
    add_member(db, owner, classroom_id, viewer, SpaceRole.VIEWER)
    seed_stream(db, classroom_id, owner, editor, viewer)
    take_cell_quiz(db, classroom_id, viewer)
    return classroom_id


WELCOME_POST = "Welcome to Biology 101! Read Cell basics first, then take the Cell quiz."
LAB_POST = "The lab starts next week. Bring your gloves."
STUDENT_COMMENT = "Thanks, I will start tonight."


def seed_stream(db: Session, classroom_id: str, owner: User, editor: User, viewer: User) -> None:
    """Two posts (owner, then co-teacher) and a student comment on the first, through the services.

    The default feed permission is STUDENTS_COMMENT, so the student comments but does not post.
    """
    welcome = space_feed_service.create_post(
        db, space_id=classroom_id, current_user=owner, data=SpacePostCreate(body=WELCOME_POST)
    )
    space_feed_service.create_post(db, space_id=classroom_id, current_user=editor, data=SpacePostCreate(body=LAB_POST))
    space_feed_service.create_comment(
        db, post_id=welcome.id, current_user=viewer, data=SpaceCommentCreate(body=STUDENT_COMMENT)
    )


def clear_notifications(db: Session, users: tuple[User, ...]) -> None:
    """Delete the notifications that the seed events made (invites, posts, comments).

    A spec then starts from a known bell: the only notification a user gets is the lazy "due soon" one
    (the student's Cell quiz), made on the first bell fetch.
    """
    db.execute(text("DELETE FROM notification WHERE user_id = ANY(:ids)"), {"ids": [u.id for u in users]})
    db.commit()


def take_cell_quiz(db: Session, classroom_id: str, student: User) -> None:
    """One attempt through the service: 1 right answer of 2 (50 %), so the score and the grade are real."""
    item = db.scalars(
        select(SpaceItem).where(
            SpaceItem.space_id == classroom_id, SpaceItem.is_draft.is_(False), SpaceItem.kind == int(SpaceItemKind.TEST)
        )
    ).all()
    quiz = next(i for i in item if i.due_at is not None)
    start = space_attempt_service.start_attempt(db, space_id=classroom_id, item_id=quiz.id, current_user=student)
    assert start.attempt_id is not None
    answers = [
        {"question_id": q.id, "user_answer": "mitochondria" if "mitochondria" in q.prompt else "ribosome"}
        for q in start.test.questions
    ]
    space_attempt_service.submit_attempt(
        db,
        space_id=classroom_id,
        attempt_id=start.attempt_id,
        current_user=student,
        submission=TestSubmission.model_validate({"answers": answers}),
        background_tasks=BackgroundTasks(),
    )


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
    "Progress Course": seed_progress(db, owner, viewer),
    "Intro to Chemistry": seed_other_owner(db, editor),
}
classroom_id = seed_classroom(db, owner, editor, viewer)
print("done\n")

print("Clearing the seed notifications... ", end="", flush=True)
clear_notifications(db, (owner, editor, viewer, outsider))
print("done\n")

print("Creating the older version result... ", end="", flush=True)
seed_older_version_result(db, viewer)
print("done\n")

for title, space_id in ids.items():
    space = db.get(Space, space_id)
    assert space is not None
    print(f"{title:22} /courses/{space_id}   code: {space.join_code}")
print(f"{CLASSROOM_TITLE:22} /classrooms/{classroom_id}   code: {CLASSROOM_CODE}")
db.close()
