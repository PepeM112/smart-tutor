"""Classrooms: create, settings, courses in a classroom, "Due soon" (see docs/spaces.md, "Classrooms").

Shared with courses (same `/spaces` routes): get, update, archive, delete, join code, members, and the
classwork edit mode (`space_draft_service`). This module has what only a classroom has.

Who can do what (R33): OWNER = everything. EDITOR (co-teacher) = content and students.
Settings, the Class key and the co-teachers are for the OWNER only.
"""

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import SpaceItemKind, SpaceKind, SpaceRole, SpaceVisibility
from app.crud import classroom_settings as classroom_settings_crud
from app.crud import space as space_crud
from app.crud import space_content as space_content_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import space_item_test as space_item_test_crud
from app.crud import space_member as space_member_crud
from app.crud import space_section as space_section_crud
from app.models.classroom_settings import ClassroomSettings
from app.models.space import Space
from app.models.user import User
from app.schemas.space import (
    ClassroomCourseCreate,
    ClassroomCourseDuplicate,
    ClassroomCreate,
    ClassroomSettingsRead,
    ClassroomSettingsUpdate,
    DueSoonItem,
    SpaceDetail,
)
from app.services import encryption, space_progress_service
from app.services.space_draft_service import lock_editing
from app.services.space_service import (
    build_detail,
    copy_published_content,
    get_classroom_or_404,
    get_course_or_404,
    get_membership,
    new_join_code,
    now,
    require_active,
    require_author,
    require_owner,
)

DUE_SOON_WINDOW = timedelta(hours=24)
PROVIDER_CHANGE_NEEDS_KEY = "Send a new Class key when you change the provider"


def create_classroom(db: Session, *, current_user: User, data: ClassroomCreate) -> SpaceDetail:
    """A new classroom starts in edit mode, with its settings row. It is never in the catalog."""
    space = space_crud.create(
        db,
        kind=int(SpaceKind.CLASSROOM),
        owner_id=current_user.id,
        title=data.title,
        description=data.description,
        tags=data.tags,
        visibility=int(data.visibility),
        join_code=new_join_code(db),
        draft_started_at=now(),
    )
    classroom_settings_crud.create(db, space_id=space.id)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


# ── Courses in a classroom ────────────────────────────────────────────────────


def _lock_classwork(db: Session, *, classroom_id: str, section_id: str, current_user: User) -> Space:
    """Lock the classroom in edit mode (OWNER / EDITOR) and check the draft section."""
    get_classroom_or_404(db, space_id=classroom_id)
    classroom = lock_editing(db, space_id=classroom_id, current_user=current_user)
    if space_section_crud.get_draft(db, space_id=classroom.id, section_id=section_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    return classroom


def _new_course(
    db: Session, *, classroom: Space, section_id: str, title: str, description: str, tags: list[str]
) -> Space:
    """A course of the classroom, in edit mode, with a draft COURSE item.

    It has no visibility and no members of its own: the students are the members of the classroom.
    """
    course = space_crud.create(
        db,
        kind=int(SpaceKind.COURSE),
        parent_id=classroom.id,
        owner_id=classroom.owner_id,
        title=title,
        description=description,
        tags=tags,
        visibility=int(SpaceVisibility.PRIVATE),
        join_code=None,
        draft_started_at=now(),
    )
    space_item_crud.create(
        db,
        space_id=classroom.id,
        section_id=section_id,
        kind=int(SpaceItemKind.COURSE),
        position=space_item_crud.next_position(db, section_id=section_id),
        is_draft=True,
        child_space_id=course.id,
    )
    return course


def add_course(db: Session, *, classroom_id: str, current_user: User, data: ClassroomCourseCreate) -> SpaceDetail:
    """A new empty course at the end of a draft section. The course publishes on its own."""
    classroom = _lock_classwork(db, classroom_id=classroom_id, section_id=data.section_id, current_user=current_user)
    course = _new_course(
        db,
        classroom=classroom,
        section_id=data.section_id,
        title=data.title,
        description=data.description,
        tags=data.tags,
    )
    db.commit()
    return build_detail(db, space=course, current_user=current_user)


def add_course_copy(
    db: Session, *, classroom_id: str, current_user: User, data: ClassroomCourseDuplicate
) -> SpaceDetail:
    """ "Duplicate into classroom": copy the PUBLISHED content of a standalone course of the user.

    No members, drafts, results or progress are copied (same rules as `duplicate_course`).
    """
    source = get_course_or_404(db, space_id=data.source_id)
    if source.parent_id is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    require_author(db, space=source, user=current_user)
    classroom = _lock_classwork(db, classroom_id=classroom_id, section_id=data.section_id, current_user=current_user)
    course = _new_course(
        db,
        classroom=classroom,
        section_id=data.section_id,
        title=data.title,
        description=data.description,
        tags=data.tags,
    )
    copy_published_content(db, source=source, target=course, user=current_user)
    db.commit()
    return build_detail(db, space=course, current_user=current_user)


# ── Settings (OWNER only) ─────────────────────────────────────────────────────


def _get_settings(db: Session, *, classroom: Space) -> ClassroomSettings:
    """The row is made with the classroom. A missing one (old data) is made here."""
    existing = classroom_settings_crud.get(db, space_id=classroom.id)
    return existing if existing is not None else classroom_settings_crud.create(db, space_id=classroom.id)


def _settings_read(settings: ClassroomSettings) -> ClassroomSettingsRead:
    return ClassroomSettingsRead.model_validate(
        {
            "feed_permission": settings.feed_permission,
            "ai_provider": settings.ai_provider,
            "has_class_key": settings.encrypted_class_key is not None,
            "key_priority": settings.key_priority,
            "key_scope": settings.key_scope,
            "monthly_token_cap_per_student": settings.monthly_token_cap_per_student,
        }
    )


def get_settings(db: Session, *, classroom_id: str, current_user: User) -> ClassroomSettingsRead:
    classroom = get_classroom_or_404(db, space_id=classroom_id)
    require_owner(db, space=classroom, user=current_user)
    return _settings_read(_get_settings(db, classroom=classroom))


def update_settings(
    db: Session, *, classroom_id: str, current_user: User, data: ClassroomSettingsUpdate
) -> ClassroomSettingsRead:
    """Only the sent fields change. The Class key is stored encrypted and never returned."""
    classroom = get_classroom_or_404(db, space_id=classroom_id)
    require_owner(db, space=classroom, user=current_user)
    sent = data.model_fields_set
    # An archived classroom is read-only, with one exception: the owner can remove the Class key, so that
    # archiving a classroom never leaves a key that the owner cannot delete (B-P1-1).
    if not (sent == {"class_key"} and data.class_key is not None and not data.class_key.strip()):
        require_active(db, classroom)
    settings = _get_settings(db, classroom=classroom)
    # A key is bound to its provider. Keeping it after a provider change makes every call fail at the provider (B-P2-8).
    # Sending `class_key` (a new key, or "" to remove it) in the same request is fine.
    new_provider = int(data.ai_provider) if data.ai_provider is not None else None
    if (
        "ai_provider" in sent
        and new_provider != settings.ai_provider
        and settings.encrypted_class_key
        and data.class_key is None
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=PROVIDER_CHANGE_NEEDS_KEY)
    if "feed_permission" in sent and data.feed_permission is not None:
        settings.feed_permission = int(data.feed_permission)
    if "key_priority" in sent and data.key_priority is not None:
        settings.key_priority = int(data.key_priority)
    if "key_scope" in sent and data.key_scope is not None:
        settings.key_scope = int(data.key_scope)
    if "monthly_token_cap_per_student" in sent:
        settings.monthly_token_cap_per_student = data.monthly_token_cap_per_student
    if "ai_provider" in sent:
        settings.ai_provider = int(data.ai_provider) if data.ai_provider is not None else None
    if "class_key" in sent and data.class_key is not None:
        key = data.class_key.strip()
        if key and settings.ai_provider is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a provider for the Class key")
        settings.encrypted_class_key = encryption.encrypt(key) if key else None
    db.commit()
    return _settings_read(settings)


# ── Due soon ──────────────────────────────────────────────────────────────────


def due_soon(db: Session, *, classroom_id: str, current_user: User) -> list[DueSoonItem]:
    """Items of the classroom and of its visible courses due in the next 24 hours that the student has not done.

    Only students have progress, so the list is empty for the owner and the co-teachers.
    """
    classroom = get_classroom_or_404(db, space_id=classroom_id)
    if get_membership(db, space=classroom, user=current_user).role != SpaceRole.VIEWER:
        return []
    children = space_crud.list_children(db, parent_id=classroom.id)
    hidden = space_item_crud.list_hidden_course_ids(db, course_ids=[c.id for c in children])
    courses = [c for c in children if c.id not in hidden]
    spaces = {s.id: s for s in [classroom, *courses]}
    start = space_progress_service.utcnow()
    items = space_item_crud.list_due(db, space_ids=list(spaces), start=start, end=start + DUE_SOON_WINDOW)

    done = space_item_completion_crud.list_completed_ids(db, user_id=current_user.id, item_ids=[i.id for i in items])
    course_rows = space_member_crud.list_for_user(
        db, user_id=current_user.id, space_ids=[i.child_space_id for i in items if i.child_space_id]
    )
    done_courses = {r.space_id for r in course_rows if r.completed_at is not None}
    pending = [i for i in items if i.id not in done and (i.child_space_id or "") not in done_courses]

    links = space_item_test_crud.list_by_items(db, item_ids=[i.id for i in pending])
    first_test = {item_id: tests[0] for item_id, tests in links.items() if tests}
    notes = {n.id: n.title for n in space_content_crud.list_notes(db, ids=[i.note_id for i in pending if i.note_id])}
    tests = {t.id: t.title for t in space_content_crud.list_tests(db, ids=list(first_test.values()))}

    def title_of(item_id: str, note_id: str | None, child_id: str | None) -> str:
        if child_id is not None:
            return spaces[child_id].title if child_id in spaces else ""
        return notes.get(note_id or "") or tests.get(first_test.get(item_id, "")) or ""

    return [
        DueSoonItem(
            item_id=i.id,
            kind=SpaceItemKind(i.kind),
            title=title_of(i.id, i.note_id, i.child_space_id),
            due_at=i.due_at,
            space_id=i.space_id,
            space_title=spaces[i.space_id].title,
            classroom_id=classroom.id,
        )
        for i in pending
        if i.due_at is not None
    ]
