"""ST-68 Phase A: classrooms, lazy member rows, co-teacher matrix, scheduling (real DB, each test is rolled back)."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    AttemptStatus,
    KeyScope,
    MemberStatus,
    RevealAnswers,
    SpaceItemKind,
    SpaceKind,
    SpaceRole,
    SpaceStatus,
    SpaceVisibility,
)
from app.crud import note as note_crud
from app.crud import question as question_crud
from app.crud import space as space_crud
from app.models.classroom_settings import ClassroomSettings
from app.models.note import Note
from app.models.space import Space
from app.models.space_attempt import SpaceAttempt
from app.models.space_item import SpaceItem
from app.models.space_member import SpaceMember
from app.models.test import Test as ExamTest
from app.models.test_result import TestResult as ResultRow
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.space import (
    ClassroomCourseCreate,
    ClassroomCourseDuplicate,
    ClassroomCreate,
    ClassroomSettingsUpdate,
    SpaceAttemptStart,
    SpaceCreate,
    SpaceItemCopy,
    SpaceItemUpdate,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceUpdate,
)
from app.services import (
    classroom_service,
    space_attempt_service,
    space_draft_service,
    space_member_service,
    space_progress_service,
    space_service,
)
from app.services.access_service import AccessLevel, can_access_note, get_space_access
from tests.space_factories import add_member, new_item, new_note, new_space, new_test, new_user

pytestmark = pytest.mark.db


def _status_code(service_call: Callable[..., object], db: Session, **kwargs: object) -> int:
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return exc_info.value.status_code


def _detail(service_call: Callable[..., object], db: Session, **kwargs: object) -> str:
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return str(exc_info.value.detail)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture
def owner(db_session: Session) -> User:
    return new_user(db_session)


# ── Builders ──────────────────────────────────────────────────────────────────


def _publish(db: Session, user: User, space_id: str) -> None:
    space_draft_service.publish(db, space_id=space_id, current_user=user, data=SpacePublishRequest.model_validate({}))


def _section(db: Session, user: User, space_id: str) -> str:
    detail = space_draft_service.add_section(
        db, space_id=space_id, current_user=user, data=SpaceSectionCreate(title="S")
    )
    assert detail.draft_sections
    return detail.draft_sections[-1].id


def _new_classroom(db: Session, owner: User) -> str:
    return classroom_service.create_classroom(db, current_user=owner, data=ClassroomCreate(title="Class")).id


def _classroom_course(db: Session, teacher: User, classroom_id: str, *, test: bool = False, note: bool = False) -> str:
    """A published course in the classroom. The classroom item is not published yet. Returns the course id."""
    section_id = _section(db, teacher, classroom_id)
    course = classroom_service.add_course(
        db,
        classroom_id=classroom_id,
        current_user=teacher,
        data=ClassroomCourseCreate(title="Course", section_id=section_id),
    )
    course_section = _section(db, teacher, course.id)
    if test:
        space_draft_service.copy_item(
            db,
            space_id=course.id,
            current_user=teacher,
            data=SpaceItemCopy(section_id=course_section, test_id=new_test(db, user=teacher).id),
        )
    if note:
        space_draft_service.copy_item(
            db,
            space_id=course.id,
            current_user=teacher,
            data=SpaceItemCopy(section_id=course_section, note_id=new_note(db, user=teacher).id),
        )
    if test or note:
        _publish(db, teacher, course.id)
    return course.id


def _published_classroom(db: Session, owner: User, *, test: bool = False, note: bool = False) -> tuple[str, str]:
    """A classroom with one published course. Returns (classroom id, course id)."""
    classroom_id = _new_classroom(db, owner)
    course_id = _classroom_course(db, owner, classroom_id, test=test, note=note)
    _publish(db, owner, classroom_id)
    return classroom_id, course_id


def _student(db: Session, classroom_id: str) -> User:
    student = new_user(db)
    classroom = db.get(Space, classroom_id)
    assert classroom is not None
    add_member(db, space=classroom, user=student, role=SpaceRole.VIEWER)
    return student


def _teacher(db: Session, classroom_id: str) -> User:
    teacher = new_user(db)
    classroom = db.get(Space, classroom_id)
    assert classroom is not None
    add_member(db, space=classroom, user=teacher, role=SpaceRole.EDITOR)
    return teacher


def _items(db: Session, space_id: str, kind: SpaceItemKind) -> list[SpaceItem]:
    stmt = select(SpaceItem).where(
        SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(False), SpaceItem.kind == int(kind)
    )
    return list(db.scalars(stmt).all())


def _rows(db: Session, space_id: str, user_id: str) -> list[SpaceMember]:
    return list(db.scalars(select(SpaceMember).where(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id)))


# ── Lazy member row, inherited role (C4) ──────────────────────────────────────


class TestLazyRow:
    def test_a_student_reads_marks_and_toggles_review_without_a_row(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner, note=True)
        student = _student(db_session, classroom_id)
        assert _rows(db_session, course_id, student.id) == []
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role == SpaceRole.VIEWER

        detail = space_service.get_course(db_session, space_id=course_id, current_user=student)
        assert detail.my_role == SpaceRole.VIEWER
        assert detail.progress is not None and detail.progress.total_items == 1

        note_item = _items(db_session, course_id, SpaceItemKind.NOTE)[0]
        space_member_service.record_visit(db_session, space_id=course_id, item_id=note_item.id, current_user=student)
        progress = space_member_service.set_item_completed(
            db_session, space_id=course_id, item_id=note_item.id, current_user=student, completed=True
        )
        assert progress.percent == 100
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)

        rows = _rows(db_session, course_id, student.id)
        assert len(rows) == 1
        assert rows[0].role is None and rows[0].status == int(MemberStatus.ACTIVE)
        assert rows[0].include_in_srs and rows[0].last_item_id == note_item.id and rows[0].completed_at is not None

    def test_the_lazy_row_is_made_once(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        first = space_progress_service.get_member_row(db_session, space_id=course_id, user_id=student.id)
        second = space_progress_service.get_member_row(db_session, space_id=course_id, user_id=student.id)
        assert first is not None and second is not None and first.user_id == second.user_id
        assert len(_rows(db_session, course_id, student.id)) == 1

    def test_no_row_for_a_stranger_or_the_owner(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        stranger = new_user(db_session)
        assert space_progress_service.get_member_row(db_session, space_id=course_id, user_id=stranger.id) is None
        assert space_progress_service.get_member_row(db_session, space_id=course_id, user_id=owner.id) is None
        pending = new_user(db_session)
        classroom = db_session.get(Space, classroom_id)
        assert classroom is not None
        add_member(
            db_session, space=classroom, user=pending, role=SpaceRole.VIEWER, member_status=MemberStatus.REQUESTED
        )
        assert space_progress_service.get_member_row(db_session, space_id=course_id, user_id=pending.id) is None

    def test_a_role_change_in_the_classroom_applies_at_once(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role == SpaceRole.VIEWER

        space_member_service.set_role(
            db_session, space_id=classroom_id, user_id=student.id, current_user=owner, role=SpaceRole.EDITOR
        )
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role == SpaceRole.EDITOR
        # The co-teacher can edit the course with no row of its own.
        space_draft_service.enter_edit_mode(db_session, space_id=course_id, current_user=student)

        space_member_service.set_role(
            db_session, space_id=classroom_id, user_id=student.id, current_user=owner, role=SpaceRole.VIEWER
        )
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role == SpaceRole.VIEWER

    def test_leave_removes_the_access_and_the_lazy_rows(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)
        assert len(_rows(db_session, course_id, student.id)) == 1

        space_member_service.leave(db_session, space_id=classroom_id, current_user=student)
        assert _rows(db_session, course_id, student.id) == []
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role is None
        assert course_id not in set(db_session.scalars(space_crud.joined_space_ids(user_id=student.id)))

    def test_remove_member_deletes_the_lazy_rows(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)
        space_member_service.remove_member(db_session, space_id=classroom_id, user_id=student.id, current_user=owner)
        assert _rows(db_session, course_id, student.id) == []
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role is None

    def test_an_old_lazy_row_gives_no_access_after_leaving(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)
        # Only the classroom row goes (as if an old lazy row was left behind).
        db_session.delete(_rows(db_session, classroom_id, student.id)[0])
        db_session.flush()
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role is None
        assert space_progress_service.get_member_row(db_session, space_id=course_id, user_id=student.id) is None
        assert course_id not in set(db_session.scalars(space_crud.joined_space_ids(user_id=student.id)))

    def test_lazy_rows_are_not_members_or_counted(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)
        assert space_crud.count_active_members(db_session, space_ids=[course_id]).get(course_id, 0) == 0
        members = space_member_service.list_members(db_session, space_id=classroom_id, current_user=owner)
        assert [m.user_id for m in members] == [student.id]
        assert members[0].role == SpaceRole.VIEWER

    def test_rag_and_joined_ids_include_the_classroom_courses(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner, note=True)
        student = _student(db_session, classroom_id)
        joined = set(db_session.scalars(space_crud.joined_space_ids(user_id=student.id)))
        assert {classroom_id, course_id} <= joined
        note_id = db_session.scalars(select(Note.id).where(Note.space_id == course_id, Note.is_draft.is_(False))).one()
        readable = set(db_session.scalars(select(Note.id).where(note_crud.readable_by_assistant(user_id=student.id))))
        assert note_id in readable


# ── Classroom CRUD, visibility, archive, delete (C2) ──────────────────────────


class TestClassroomCrud:
    def test_create_makes_settings_a_join_code_and_edit_mode(self, db_session: Session, owner: User) -> None:
        detail = classroom_service.create_classroom(
            db_session, current_user=owner, data=ClassroomCreate(title="Class", tags=["a"])
        )
        assert detail.kind == SpaceKind.CLASSROOM and detail.my_role == SpaceRole.OWNER
        assert detail.join_code is not None
        assert detail.draft_sections is not None
        assert db_session.get(ClassroomSettings, detail.id) is not None

    def test_a_classroom_is_never_public(self, db_session: Session, owner: User) -> None:
        with pytest.raises(ValidationError):
            ClassroomCreate.model_validate({"title": "x", "visibility": int(SpaceVisibility.PUBLIC)})
        unlisted = classroom_service.create_classroom(
            db_session,
            current_user=owner,
            data=ClassroomCreate(title="U", visibility=SpaceVisibility.UNLISTED),
        )
        assert unlisted.visibility == SpaceVisibility.UNLISTED
        code = _status_code(
            space_service.update_course,
            db_session,
            space_id=unlisted.id,
            current_user=owner,
            data=SpaceUpdate(visibility=SpaceVisibility.PUBLIC),
        )
        assert code == 400

    def test_a_classroom_is_not_in_the_catalog_or_the_course_lists(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        unlisted = classroom_service.create_classroom(
            db_session, current_user=owner, data=ClassroomCreate(title="U", visibility=SpaceVisibility.UNLISTED)
        )
        catalog, _ = space_service.list_catalog(
            db_session, current_user=owner, search=None, sort="newest", page=1, per_page=100
        )
        listed = {s.id for s in catalog}
        assert not ({classroom_id, course_id, unlisted.id} & listed)
        courses = {s.id for s in space_service.list_my_courses(db_session, current_user=owner)}
        assert not ({classroom_id, course_id} & courses)
        classrooms = {s.id for s in space_service.list_my_classrooms(db_session, current_user=owner)}
        assert {classroom_id, unlisted.id} <= classrooms and course_id not in classrooms

    def test_a_course_of_a_classroom_has_no_visibility_of_its_own(self, db_session: Session, owner: User) -> None:
        _, course_id = _published_classroom(db_session, owner)
        code = _status_code(
            space_service.update_course,
            db_session,
            space_id=course_id,
            current_user=owner,
            data=SpaceUpdate(visibility=SpaceVisibility.PUBLIC),
        )
        assert code == 400
        detail = space_service.get_course(db_session, space_id=course_id, current_user=owner)
        assert detail.join_code is None and detail.parent_id is not None

    def test_invite_request_and_join_code_work_on_a_classroom(self, db_session: Session, owner: User) -> None:
        classroom_id = _new_classroom(db_session, owner)
        _publish_empty_ok = db_session.get(Space, classroom_id)
        assert _publish_empty_ok is not None
        invited, requester, by_code = new_user(db_session), new_user(db_session), new_user(db_session)

        space_member_service.invite(db_session, space_id=classroom_id, current_user=owner, identifier=invited.username)
        assert [i.id for i in space_service.list_invitations(db_session, current_user=invited)] == [classroom_id]
        space_member_service.accept_invitation(db_session, space_id=classroom_id, current_user=invited)

        space_member_service.join(db_session, space_id=classroom_id, current_user=requester)
        assert _rows(db_session, classroom_id, requester.id)[0].status == int(MemberStatus.REQUESTED)
        space_member_service.approve_request(
            db_session, space_id=classroom_id, user_id=requester.id, current_user=owner
        )

        assert _publish_empty_ok.join_code is not None
        joined = space_member_service.join_by_code(db_session, code=_publish_empty_ok.join_code, current_user=by_code)
        assert joined.id == classroom_id and joined.my_role == SpaceRole.VIEWER
        statuses = {
            m.user_id: m.status
            for m in space_member_service.list_members(db_session, space_id=classroom_id, current_user=owner)
        }
        assert statuses == {u.id: MemberStatus.ACTIVE for u in (invited, requester, by_code)}

    def test_archive_makes_the_courses_read_only_and_unarchive_restores(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        space_service.set_archived(db_session, space_id=classroom_id, current_user=owner, archived=True)
        assert get_space_access(db_session, space_id=course_id, user_id=owner.id).status == SpaceStatus.ARCHIVED
        detail = space_service.get_course(db_session, space_id=course_id, current_user=owner)
        assert detail.status == SpaceStatus.ARCHIVED and not detail.can_edit
        message = _detail(space_draft_service.enter_edit_mode, db_session, space_id=course_id, current_user=owner)
        assert message == "The classroom is archived"

        space_service.set_archived(db_session, space_id=classroom_id, current_user=owner, archived=False)
        space_draft_service.enter_edit_mode(db_session, space_id=course_id, current_user=owner)

    def test_delete_forever_removes_child_courses_tests_and_results(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner, test=True, note=True)
        student = _student(db_session, classroom_id)
        item = _items(db_session, course_id, SpaceItemKind.TEST)[0]
        started = space_attempt_service.start_attempt(
            db_session, space_id=course_id, item_id=item.id, current_user=student
        )
        _submit(db_session, course_id, started, student)
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)
        assert db_session.scalars(select(ResultRow).where(ResultRow.user_id == student.id)).first() is not None

        wrong = _status_code(
            space_service.delete_course_forever,
            db_session,
            space_id=classroom_id,
            current_user=owner,
            confirm_title="nope",
        )
        assert wrong == 400
        space_service.delete_course_forever(
            db_session, space_id=classroom_id, current_user=owner, confirm_title="Class"
        )
        db_session.expire_all()
        assert db_session.get(Space, classroom_id) is None and db_session.get(Space, course_id) is None
        assert db_session.scalar(select(func.count()).select_from(ExamTest).where(ExamTest.space_id == course_id)) == 0
        assert db_session.scalars(select(ResultRow).where(ResultRow.user_id == student.id)).first() is None
        assert (
            db_session.scalar(select(func.count()).select_from(SpaceItem).where(SpaceItem.space_id == course_id)) == 0
        )
        assert db_session.get(ClassroomSettings, classroom_id) is None


# ── Co-teacher matrix (C5) ────────────────────────────────────────────────────


class TestCoTeacherMatrix:
    def test_a_co_teacher_edits_publishes_and_manages_students(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner, note=True)
        teacher = _teacher(db_session, classroom_id)
        student = _student(db_session, classroom_id)
        applicant, invitee = new_user(db_session), new_user(db_session)

        # Edit + publish the content of the classroom and of its course.
        space_draft_service.enter_edit_mode(db_session, space_id=classroom_id, current_user=teacher)
        _section(db_session, teacher, classroom_id)
        _publish(db_session, teacher, classroom_id)
        space_draft_service.enter_edit_mode(db_session, space_id=course_id, current_user=teacher)
        _section(db_session, teacher, course_id)
        _publish(db_session, teacher, course_id)

        # Students: invite, approve, remove.
        space_member_service.invite(
            db_session, space_id=classroom_id, current_user=teacher, identifier=invitee.username
        )
        space_member_service.join(db_session, space_id=classroom_id, current_user=applicant)
        space_member_service.approve_request(
            db_session, space_id=classroom_id, user_id=applicant.id, current_user=teacher
        )
        space_member_service.remove_member(db_session, space_id=classroom_id, user_id=student.id, current_user=teacher)
        assert _rows(db_session, classroom_id, student.id) == []

    def test_only_the_owner_reads_and_changes_the_settings(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        teacher = _teacher(db_session, classroom_id)
        student = _student(db_session, classroom_id)
        for user in (teacher, student):
            assert (
                _status_code(classroom_service.get_settings, db_session, classroom_id=classroom_id, current_user=user)
                == 403
            )
            assert (
                _status_code(
                    classroom_service.update_settings,
                    db_session,
                    classroom_id=classroom_id,
                    current_user=user,
                    data=ClassroomSettingsUpdate(key_scope=KeyScope.ALL),
                )
                == 403
            )
        settings = classroom_service.update_settings(
            db_session,
            classroom_id=classroom_id,
            current_user=owner,
            data=ClassroomSettingsUpdate(key_scope=KeyScope.ALL, monthly_token_cap_per_student=1000),
        )
        assert settings.key_scope == KeyScope.ALL and settings.monthly_token_cap_per_student == 1000

    def test_only_the_owner_sets_the_class_key(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        teacher = _teacher(db_session, classroom_id)
        data = ClassroomSettingsUpdate.model_validate({"aiProvider": 1, "classKey": "sk-test-key"})
        assert (
            _status_code(
                classroom_service.update_settings,
                db_session,
                classroom_id=classroom_id,
                current_user=teacher,
                data=data,
            )
            == 403
        )
        settings = classroom_service.update_settings(
            db_session, classroom_id=classroom_id, current_user=owner, data=data
        )
        assert settings.has_class_key and not hasattr(settings, "class_key")
        stored = db_session.get(ClassroomSettings, classroom_id)
        assert stored is not None and stored.encrypted_class_key not in (None, "sk-test-key")
        removed = classroom_service.update_settings(
            db_session,
            classroom_id=classroom_id,
            current_user=owner,
            data=ClassroomSettingsUpdate.model_validate({"classKey": ""}),
        )
        assert not removed.has_class_key

    def test_only_the_owner_manages_co_teachers(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        teacher = _teacher(db_session, classroom_id)
        other_teacher = _teacher(db_session, classroom_id)
        student = _student(db_session, classroom_id)
        # Promote.
        assert (
            _status_code(
                space_member_service.set_role,
                db_session,
                space_id=classroom_id,
                user_id=student.id,
                current_user=teacher,
                role=SpaceRole.EDITOR,
            )
            == 403
        )
        # Demote.
        assert (
            _status_code(
                space_member_service.set_role,
                db_session,
                space_id=classroom_id,
                user_id=other_teacher.id,
                current_user=teacher,
                role=SpaceRole.VIEWER,
            )
            == 403
        )
        # Remove a co-teacher.
        assert (
            _status_code(
                space_member_service.remove_member,
                db_session,
                space_id=classroom_id,
                user_id=other_teacher.id,
                current_user=teacher,
            )
            == 403
        )
        space_member_service.set_role(
            db_session, space_id=classroom_id, user_id=student.id, current_user=owner, role=SpaceRole.EDITOR
        )
        space_member_service.remove_member(
            db_session, space_id=classroom_id, user_id=other_teacher.id, current_user=owner
        )

    def test_only_the_owner_archives_and_unarchives(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        teacher = _teacher(db_session, classroom_id)
        assert (
            _status_code(
                space_service.set_archived, db_session, space_id=classroom_id, current_user=teacher, archived=True
            )
            == 403
        )
        space_service.set_archived(db_session, space_id=classroom_id, current_user=owner, archived=True)
        assert (
            _status_code(
                space_service.set_archived, db_session, space_id=classroom_id, current_user=teacher, archived=False
            )
            == 403
        )

    def test_only_the_owner_deletes(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        teacher = _teacher(db_session, classroom_id)
        code = _status_code(
            space_service.delete_course_forever,
            db_session,
            space_id=classroom_id,
            current_user=teacher,
            confirm_title="Class",
        )
        assert code == 403
        assert db_session.get(Space, classroom_id) is not None

    def test_a_student_can_not_edit_or_invite(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        assert (
            _status_code(space_draft_service.enter_edit_mode, db_session, space_id=classroom_id, current_user=student)
            == 403
        )
        assert (
            _status_code(
                space_member_service.invite,
                db_session,
                space_id=classroom_id,
                current_user=student,
                identifier=owner.username,
            )
            == 403
        )


# ── Classwork: courses, schedule fields (C3, C9) ──────────────────────────────


class TestClassworkEngine:
    def test_the_new_course_is_hidden_until_the_classroom_publishes_its_item(
        self, db_session: Session, owner: User
    ) -> None:
        classroom_id = _new_classroom(db_session, owner)
        course_id = _classroom_course(db_session, owner, classroom_id, note=True)
        student = _student(db_session, classroom_id)
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role is None
        assert course_id not in set(db_session.scalars(space_crud.joined_space_ids(user_id=student.id)))

        _publish(db_session, owner, classroom_id)
        assert get_space_access(db_session, space_id=course_id, user_id=student.id).role == SpaceRole.VIEWER
        detail = space_service.get_course(db_session, space_id=classroom_id, current_user=student)
        course_item = next(i for s in detail.sections for i in s.items if i.kind == SpaceItemKind.COURSE)
        assert course_item.child_space_id == course_id and course_item.title == "Course"
        assert course_item.child_progress is not None and course_item.child_progress.total_items == 1

    def test_a_course_publishes_on_its_own(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner, note=True)
        space_draft_service.enter_edit_mode(db_session, space_id=course_id, current_user=owner)
        _section(db_session, owner, course_id)
        _publish(db_session, owner, course_id)
        classroom = db_session.get(Space, classroom_id)
        assert classroom is not None and classroom.draft_started_at is None

    def test_a_removed_course_item_deletes_the_orphan_course(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner, test=True)
        detail = space_draft_service.enter_edit_mode(db_session, space_id=classroom_id, current_user=owner)
        assert detail.draft_sections
        draft_item = next(i for s in detail.draft_sections for i in s.items if i.child_space_id == course_id)
        space_draft_service.delete_item(db_session, space_id=classroom_id, item_id=draft_item.id, current_user=owner)
        # The published item still points to the course, so it stays until the publish.
        assert db_session.get(Space, course_id) is not None
        _publish(db_session, owner, classroom_id)
        db_session.expire_all()
        assert db_session.get(Space, course_id) is None
        assert db_session.scalar(select(func.count()).select_from(ExamTest).where(ExamTest.space_id == course_id)) == 0

    def test_discard_deletes_a_course_added_in_the_draft(self, db_session: Session, owner: User) -> None:
        classroom_id, kept_id = _published_classroom(db_session, owner)
        space_draft_service.enter_edit_mode(db_session, space_id=classroom_id, current_user=owner)
        added_id = _classroom_course(db_session, owner, classroom_id)
        space_draft_service.discard(db_session, space_id=classroom_id, current_user=owner)
        db_session.expire_all()
        assert db_session.get(Space, added_id) is None and db_session.get(Space, kept_id) is not None

    def test_duplicate_into_classroom_copies_the_published_content_only(self, db_session: Session, owner: User) -> None:
        source = space_service.create_course(db_session, current_user=owner, data=SpaceCreate(title="Mine"))
        section = _section(db_session, owner, source.id)
        space_draft_service.copy_item(
            db_session,
            space_id=source.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=section, note_id=new_note(db_session, user=owner).id),
        )
        _publish(db_session, owner, source.id)
        edit = space_draft_service.enter_edit_mode(db_session, space_id=source.id, current_user=owner)
        assert edit.draft_sections
        space_draft_service.copy_item(
            db_session,
            space_id=source.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=edit.draft_sections[0].id, note_id=new_note(db_session, user=owner).id),
        )  # an unpublished draft item: must not be copied

        classroom_id = _new_classroom(db_session, owner)
        target_section = _section(db_session, owner, classroom_id)
        copy = classroom_service.add_course_copy(
            db_session,
            classroom_id=classroom_id,
            current_user=owner,
            data=ClassroomCourseDuplicate(title="Copy", section_id=target_section, source_id=source.id),
        )
        assert copy.parent_id == classroom_id and copy.join_code is None
        assert copy.draft_sections is not None
        assert sum(len(s.items) for s in copy.draft_sections) == 1
        # The source is untouched, and a course of someone else can not be copied.
        stranger = new_user(db_session)
        other = _new_classroom(db_session, stranger)
        other_section = _section(db_session, stranger, other)
        code = _status_code(
            classroom_service.add_course_copy,
            db_session,
            classroom_id=other,
            current_user=stranger,
            data=ClassroomCourseDuplicate(title="Copy", section_id=other_section, source_id=source.id),
        )
        assert code in (403, 404)

    def test_schedule_fields_on_any_item_and_the_window_on_tests_only(self, db_session: Session, owner: User) -> None:
        _, course_id = _published_classroom(db_session, owner, note=True, test=True)
        detail = space_draft_service.enter_edit_mode(db_session, space_id=course_id, current_user=owner)
        assert detail.draft_sections
        items = [i for s in detail.draft_sections for i in s.items]
        note_item = next(i for i in items if i.kind == SpaceItemKind.NOTE)
        test_item = next(i for i in items if i.kind == SpaceItemKind.TEST)
        due, opens, closes = _utcnow() + timedelta(days=1), _utcnow() + timedelta(days=2), _utcnow() + timedelta(days=3)

        space_draft_service.update_item(
            db_session,
            space_id=course_id,
            item_id=note_item.id,
            current_user=owner,
            data=SpaceItemUpdate(due_at=due, visible_from=opens),
        )
        assert (
            _status_code(
                space_draft_service.update_item,
                db_session,
                space_id=course_id,
                item_id=note_item.id,
                current_user=owner,
                data=SpaceItemUpdate(opens_at=opens),
            )
            == 400
        )
        space_draft_service.update_item(
            db_session,
            space_id=course_id,
            item_id=test_item.id,
            current_user=owner,
            data=SpaceItemUpdate(opens_at=opens, closes_at=closes),
        )
        # Only closesAt is sent: it is checked against the stored opensAt.
        assert (
            _status_code(
                space_draft_service.update_item,
                db_session,
                space_id=course_id,
                item_id=test_item.id,
                current_user=owner,
                data=SpaceItemUpdate(closes_at=opens - timedelta(hours=1)),
            )
            == 400
        )
        with pytest.raises(ValidationError):
            SpaceItemUpdate(opens_at=closes, closes_at=opens)

        _publish(db_session, owner, course_id)
        published = {
            i.kind: i
            for i in db_session.scalars(
                select(SpaceItem).where(SpaceItem.space_id == course_id, SpaceItem.is_draft.is_(False))
            )
        }
        assert published[int(SpaceItemKind.NOTE)].due_at == due
        assert published[int(SpaceItemKind.NOTE)].visible_from == opens
        assert published[int(SpaceItemKind.TEST)].closes_at == closes


# ── Test window (C6) ──────────────────────────────────────────────────────────


def _answers(start: SpaceAttemptStart, answer: str = "ir") -> TestSubmission:
    return TestSubmission.model_validate(
        {"answers": [{"question_id": q.id, "user_answer": answer} for q in start.test.questions]}
    )


def _submit(db: Session, space_id: str, start: SpaceAttemptStart, user: User) -> object:
    assert start.attempt_id is not None
    return space_attempt_service.submit_attempt(
        db,
        space_id=space_id,
        attempt_id=start.attempt_id,
        current_user=user,
        submission=_answers(start),
        background_tasks=BackgroundTasks(),
    )


def _windowed(db: Session, owner: User, **fields: object) -> tuple[str, str, str, User]:
    """A classroom course with one TEST item. Returns (classroom id, course id, item id, student)."""
    classroom_id, course_id = _published_classroom(db, owner, test=True)
    item = _items(db, course_id, SpaceItemKind.TEST)[0]
    for field, value in fields.items():
        setattr(item, field, value)
    db.flush()
    return classroom_id, course_id, item.id, _student(db, classroom_id)


class TestTestWindow:
    def test_start_before_the_window_opens(self, db_session: Session, owner: User) -> None:
        _, course_id, item_id, student = _windowed(db_session, owner, opens_at=_utcnow() + timedelta(hours=1))
        message = _detail(
            space_attempt_service.start_attempt, db_session, space_id=course_id, item_id=item_id, current_user=student
        )
        assert message == space_attempt_service.NOT_OPEN_YET == "The test is not open yet"
        # Look at this item only: a seeded DB can hold attempts of other items.
        assert db_session.scalars(select(SpaceAttempt).where(SpaceAttempt.item_id == item_id)).first() is None

    def test_start_after_the_window_closes(self, db_session: Session, owner: User) -> None:
        _, course_id, item_id, student = _windowed(db_session, owner, closes_at=_utcnow() - timedelta(minutes=1))
        message = _detail(
            space_attempt_service.start_attempt, db_session, space_id=course_id, item_id=item_id, current_user=student
        )
        assert message == space_attempt_service.TEST_CLOSED == "The test is closed"

    def test_start_inside_the_window_works(self, db_session: Session, owner: User) -> None:
        _, course_id, item_id, student = _windowed(
            db_session, owner, opens_at=_utcnow() - timedelta(hours=1), closes_at=_utcnow() + timedelta(hours=1)
        )
        started = space_attempt_service.start_attempt(
            db_session, space_id=course_id, item_id=item_id, current_user=student
        )
        assert started.attempt_id is not None

    def test_the_deadline_is_the_earlier_of_the_time_limit_and_closes_at(
        self, db_session: Session, owner: User
    ) -> None:
        closes = _utcnow() + timedelta(minutes=10)
        _, course_id, item_id, student = _windowed(db_session, owner, time_limit_minutes=60, closes_at=closes)
        started = space_attempt_service.start_attempt(
            db_session, space_id=course_id, item_id=item_id, current_user=student
        )
        assert started.deadline_at == closes

        other = _student(db_session, db_session.get(Space, course_id).parent_id)  # type: ignore[union-attr, arg-type]
        item = db_session.get(SpaceItem, item_id)
        assert item is not None
        item.closes_at = _utcnow() + timedelta(hours=5)
        db_session.flush()
        again = space_attempt_service.start_attempt(db_session, space_id=course_id, item_id=item_id, current_user=other)
        assert again.deadline_at is not None and again.started_at is not None
        assert again.deadline_at - again.started_at == timedelta(minutes=60)

    def test_the_window_alone_sets_a_deadline_when_there_is_no_time_limit(
        self, db_session: Session, owner: User
    ) -> None:
        closes = _utcnow() + timedelta(minutes=30)
        _, course_id, item_id, student = _windowed(db_session, owner, closes_at=closes)
        started = space_attempt_service.start_attempt(
            db_session, space_id=course_id, item_id=item_id, current_user=student
        )
        assert started.deadline_at == closes

    def test_submit_inside_the_grace_after_closing_is_accepted(self, db_session: Session, owner: User) -> None:
        _, course_id, item_id, student = _windowed(db_session, owner, closes_at=_utcnow() + timedelta(minutes=10))
        started = space_attempt_service.start_attempt(
            db_session, space_id=course_id, item_id=item_id, current_user=student
        )
        item = db_session.get(SpaceItem, item_id)
        assert item is not None
        item.closes_at = _utcnow() - timedelta(seconds=20)
        attempt = db_session.get(SpaceAttempt, started.attempt_id or "")
        assert attempt is not None
        attempt.deadline_at = _utcnow() - timedelta(seconds=20)
        db_session.flush()
        _submit(db_session, course_id, started, student)

    def test_submit_after_closing_and_the_grace_is_refused_and_expires_the_attempt(
        self, db_session: Session, owner: User
    ) -> None:
        _, course_id, item_id, student = _windowed(db_session, owner, closes_at=_utcnow() + timedelta(minutes=10))
        started = space_attempt_service.start_attempt(
            db_session, space_id=course_id, item_id=item_id, current_user=student
        )
        item = db_session.get(SpaceItem, item_id)
        assert item is not None
        item.closes_at = _utcnow() - timedelta(minutes=5)
        db_session.flush()
        message = _detail(
            space_attempt_service.submit_attempt,
            db_session,
            space_id=course_id,
            attempt_id=started.attempt_id,
            current_user=student,
            submission=_answers(started),
            background_tasks=BackgroundTasks(),
        )
        assert message == "The test is closed"
        db_session.expire_all()
        attempt = db_session.get(SpaceAttempt, started.attempt_id or "")
        assert attempt is not None and attempt.status == int(AttemptStatus.EXPIRED)
        assert db_session.scalars(select(ResultRow).where(ResultRow.user_id == student.id)).first() is None

    def test_an_author_preview_ignores_the_window(self, db_session: Session, owner: User) -> None:
        _, course_id, item_id, _ = _windowed(db_session, owner, closes_at=_utcnow() - timedelta(days=1))
        preview = space_attempt_service.start_attempt(
            db_session, space_id=course_id, item_id=item_id, current_user=owner
        )
        assert preview.attempt_id is None


# ── visible_from (C7) ─────────────────────────────────────────────────────────


class TestVisibleFrom:
    def test_a_future_note_is_hidden_from_students_in_access_and_rag(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        classroom = db_session.get(Space, classroom_id)
        assert classroom is not None
        teacher = _teacher(db_session, classroom_id)
        student = _student(db_session, classroom_id)
        later, soon = _utcnow() + timedelta(days=2), _utcnow() - timedelta(minutes=1)
        hidden = new_note(db_session, user=owner, space=classroom)
        shown = new_note(db_session, user=owner, space=classroom)
        new_item(db_session, space=classroom, kind=SpaceItemKind.NOTE, note=hidden, visible_from=later)
        new_item(db_session, space=classroom, kind=SpaceItemKind.NOTE, note=shown, visible_from=soon)

        assert not can_access_note(db_session, note=hidden, current_user=student, level=AccessLevel.READ)
        assert can_access_note(db_session, note=shown, current_user=student, level=AccessLevel.READ)
        for author in (owner, teacher):
            assert can_access_note(db_session, note=hidden, current_user=author, level=AccessLevel.READ)

        def rag(user: User) -> set[str]:
            return set(db_session.scalars(select(Note.id).where(note_crud.readable_by_assistant(user_id=user.id))))

        assert shown.id in rag(student) and hidden.id not in rag(student)
        assert hidden.id in rag(teacher)

    def test_a_future_item_is_out_of_the_student_view_and_the_course_percent(
        self, db_session: Session, owner: User
    ) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        course = db_session.get(Space, course_id)
        assert course is not None
        student = _student(db_session, classroom_id)
        visible = new_note(db_session, user=owner, space=course)
        later = new_note(db_session, user=owner, space=course)
        visible_item = new_item(db_session, space=course, kind=SpaceItemKind.NOTE, note=visible)
        hidden_item = new_item(
            db_session, space=course, kind=SpaceItemKind.NOTE, note=later, visible_from=_utcnow() + timedelta(days=1)
        )

        detail = space_service.get_course(db_session, space_id=course_id, current_user=student)
        ids = {i.id for s in detail.sections for i in s.items}
        assert visible_item.id in ids and hidden_item.id not in ids
        assert detail.progress is not None and detail.progress.total_items == 1
        author_detail = space_service.get_course(db_session, space_id=course_id, current_user=owner)
        assert hidden_item.id in {i.id for s in author_detail.sections for i in s.items}

        # Mark and visit on the hidden item: not found for the student.
        for call in (
            lambda: space_member_service.set_item_completed(
                db_session, space_id=course_id, item_id=hidden_item.id, current_user=student, completed=True
            ),
            lambda: space_member_service.record_visit(
                db_session, space_id=course_id, item_id=hidden_item.id, current_user=student
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                call()
            assert exc_info.value.status_code == 404
        space_member_service.set_item_completed(
            db_session, space_id=course_id, item_id=visible_item.id, current_user=student, completed=True
        )
        done = space_service.get_course(db_session, space_id=course_id, current_user=student)
        assert done.progress is not None and done.progress.percent == 100

    def test_a_future_test_can_not_be_started_and_is_not_in_review(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        course = db_session.get(Space, course_id)
        assert course is not None
        student = _student(db_session, classroom_id)
        test = new_test(db_session, user=owner, space=course)
        item = new_item(
            db_session, space=course, kind=SpaceItemKind.TEST, test=test, visible_from=_utcnow() + timedelta(days=1)
        )
        item.reveal_answers = int(RevealAnswers.ALWAYS)
        db_session.flush()
        space_member_service.set_membership(db_session, space_id=course_id, current_user=student, include_in_srs=True)
        question_id = test.questions[0].id

        assert (
            _status_code(
                space_attempt_service.start_attempt,
                db_session,
                space_id=course_id,
                item_id=item.id,
                current_user=student,
            )
            == 404
        )
        assert not question_crud.is_reviewable(db_session, question_id=question_id, user_id=student.id)

        item.visible_from = _utcnow() - timedelta(minutes=1)
        db_session.flush()
        assert question_crud.is_reviewable(db_session, question_id=question_id, user_id=student.id)
        item.visible_from = _utcnow() + timedelta(days=1)
        db_session.flush()
        assert not question_crud.is_reviewable(db_session, question_id=question_id, user_id=student.id)

    def test_a_future_course_item_hides_the_course(self, db_session: Session, owner: User) -> None:
        classroom = new_space(db_session, owner=owner, kind=SpaceKind.CLASSROOM)
        course = new_space(db_session, owner=owner, parent=classroom)
        student = new_user(db_session)
        add_member(db_session, space=classroom, user=student, role=SpaceRole.VIEWER)
        link = new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.COURSE,
            child=course,
            visible_from=_utcnow() + timedelta(days=1),
        )
        assert get_space_access(db_session, space_id=course.id, user_id=student.id).role is None
        assert get_space_access(db_session, space_id=course.id, user_id=owner.id).role == SpaceRole.OWNER
        assert course.id not in set(db_session.scalars(space_crud.joined_space_ids(user_id=student.id)))
        link.visible_from = None
        db_session.flush()
        assert get_space_access(db_session, space_id=course.id, user_id=student.id).role == SpaceRole.VIEWER
        assert course.id in set(db_session.scalars(space_crud.joined_space_ids(user_id=student.id)))


# ── Due soon (C8) ─────────────────────────────────────────────────────────────


class TestDueSoon:
    def test_lists_items_due_in_24_hours_that_are_not_done(self, db_session: Session, owner: User) -> None:
        classroom_id, course_id = _published_classroom(db_session, owner)
        classroom, course = db_session.get(Space, classroom_id), db_session.get(Space, course_id)
        assert classroom is not None and course is not None
        student = _student(db_session, classroom_id)
        soon = _utcnow() + timedelta(hours=3)

        loose = new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom),
            due_at=soon,
        )
        in_course = new_item(
            db_session,
            space=course,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=course),
            due_at=soon + timedelta(hours=1),
        )
        done = new_item(
            db_session,
            space=course,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=course),
            due_at=soon,
        )
        # Not in the list: too far, already past, hidden, or a draft.
        new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom),
            due_at=_utcnow() + timedelta(hours=30),
        )
        new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom),
            due_at=_utcnow() - timedelta(hours=1),
        )
        new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom),
            due_at=soon,
            visible_from=_utcnow() + timedelta(days=1),
        )
        new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom, is_draft=True),
            due_at=soon,
            is_draft=True,
        )

        space_member_service.set_item_completed(
            db_session, space_id=course_id, item_id=done.id, current_user=student, completed=True
        )
        result = classroom_service.due_soon(db_session, classroom_id=classroom_id, current_user=student)
        assert [r.item_id for r in result] == [loose.id, in_course.id]
        assert result[0].space_id == classroom_id and result[1].space_id == course_id
        assert all(r.classroom_id == classroom_id for r in result)
        assert result[1].space_title == "Course" and result[0].title == "Note"

    def test_the_list_is_empty_for_teachers_and_strangers_are_refused(self, db_session: Session, owner: User) -> None:
        classroom_id, _ = _published_classroom(db_session, owner)
        classroom = db_session.get(Space, classroom_id)
        assert classroom is not None
        new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom),
            due_at=_utcnow() + timedelta(hours=2),
        )
        assert classroom_service.due_soon(db_session, classroom_id=classroom_id, current_user=owner) == []
        stranger = new_user(db_session)
        assert classroom_service.due_soon(db_session, classroom_id=classroom_id, current_user=stranger) == []
