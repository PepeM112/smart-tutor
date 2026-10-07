"""The space access layer on the real Postgres DB (ST-66 acceptance criteria C2, C4, C5, C7 to C10).

Run with `pytest --run-db tests/test_access_db.py` (`make test-db`). Each test runs inside one
transaction that is rolled back (see the `db_session` fixture in `conftest.py`).
"""

from collections.abc import Callable

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus, SpaceKind, SpaceRole, SpaceStatus
from app.models.note import Note
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.models.user import User
from app.models.user_question_state import UserQuestionState
from app.schemas.note import NoteUpdate
from app.services import note_service, question_service, test_service, trash_service
from app.services.access_service import AccessLevel, get_space_access
from app.services.assist_tools import execute_tool
from app.services.versioning_service import version_test_if_needed
from tests.space_factories import add_member, new_bank_question, new_note, new_space, new_test, new_user

pytestmark = pytest.mark.db


@pytest.fixture
def owner(db_session: Session) -> User:
    return new_user(db_session)


@pytest.fixture
def course(db_session: Session, owner: User) -> Space:
    return new_space(db_session, owner=owner)


def _member(db: Session, space: Space, role: SpaceRole) -> User:
    user = new_user(db)
    add_member(db, space=space, user=user, role=role)
    return user


def _status_code(service_call: Callable[..., object], db: Session, **kwargs: object) -> int:
    """Call a service function and return the status code of the HTTPException it raises."""
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return exc_info.value.status_code


def _run(db: Session, user: User, tool: str, **arguments: object) -> str:
    return execute_tool(db, current_user=user, tool_name=tool, arguments=dict(arguments)).output


# ---------------------------------------------------------------------------
# C2: CHECK constraints
# ---------------------------------------------------------------------------


class TestCheckConstraints:
    def _rejects(self, db: Session, row: object) -> None:
        # A nested transaction keeps the session usable after the IntegrityError.
        with pytest.raises(IntegrityError), db.begin_nested():
            db.add(row)
            db.flush()

    def test_personal_note_can_not_be_a_draft(self, db_session: Session, owner: User) -> None:
        self._rejects(db_session, Note(user_id=owner.id, title="N", is_draft=True))

    def test_personal_test_can_not_be_a_draft(self, db_session: Session, owner: User) -> None:
        # Imported here: pytest would try to collect a module-level `Test*` class.
        from app.models.test import Test

        self._rejects(db_session, Test(user_id=owner.id, title="T", is_draft=True))

    def test_space_note_can_not_be_in_a_folder(self, db_session: Session, owner: User, course: Space) -> None:
        from app.schemas.folder import FolderCreate
        from app.services import folder_service

        folder = folder_service.create_folder(db_session, current_user=owner, data=FolderCreate(name="F"))
        self._rejects(db_session, Note(user_id=owner.id, title="N", space_id=course.id, folder_id=folder.id))

    def test_space_note_can_not_be_in_trash(self, db_session: Session, owner: User, course: Space) -> None:
        from datetime import datetime, timezone

        deleted_at = datetime.now(timezone.utc)
        self._rejects(db_session, Note(user_id=owner.id, title="N", space_id=course.id, deleted_at=deleted_at))

    def test_space_note_can_not_be_a_favorite(self, db_session: Session, owner: User, course: Space) -> None:
        self._rejects(db_session, Note(user_id=owner.id, title="N", space_id=course.id, is_favorite=True))

    def test_member_row_can_not_be_owner(self, db_session: Session, course: Space) -> None:
        user = new_user(db_session)
        row = SpaceMember(
            space_id=course.id, user_id=user.id, role=int(SpaceRole.OWNER), status=int(MemberStatus.ACTIVE)
        )
        self._rejects(db_session, row)

    def test_child_space_must_be_a_course(self, db_session: Session, owner: User) -> None:
        classroom = new_space(db_session, owner=owner, kind=SpaceKind.CLASSROOM)
        child = Space(kind=int(SpaceKind.CLASSROOM), owner_id=owner.id, title="C", parent_id=classroom.id)
        self._rejects(db_session, child)


# ---------------------------------------------------------------------------
# C4: role resolution
# ---------------------------------------------------------------------------


class TestSpaceAccess:
    def test_owner(self, db_session: Session, owner: User, course: Space) -> None:
        assert get_space_access(db_session, space_id=course.id, user_id=owner.id).role == SpaceRole.OWNER

    def test_active_member(self, db_session: Session, course: Space) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        assert get_space_access(db_session, space_id=course.id, user_id=viewer.id).role == SpaceRole.VIEWER

    @pytest.mark.parametrize("member_status", [MemberStatus.INVITED, MemberStatus.REQUESTED])
    def test_pending_member_has_no_role(self, db_session: Session, course: Space, member_status: MemberStatus) -> None:
        user = new_user(db_session)
        add_member(db_session, space=course, user=user, role=SpaceRole.EDITOR, member_status=member_status)
        assert get_space_access(db_session, space_id=course.id, user_id=user.id).role is None

    def test_non_member_has_no_role(self, db_session: Session, course: Space) -> None:
        outsider = new_user(db_session)
        assert get_space_access(db_session, space_id=course.id, user_id=outsider.id).role is None

    def test_classroom_member_inherits_the_role_on_a_child_course(self, db_session: Session, owner: User) -> None:
        classroom = new_space(db_session, owner=owner, kind=SpaceKind.CLASSROOM)
        child = new_space(db_session, owner=owner, parent=classroom)
        student = _member(db_session, classroom, SpaceRole.VIEWER)
        assert get_space_access(db_session, space_id=child.id, user_id=student.id).role == SpaceRole.VIEWER

    def test_classroom_owner_owns_a_child_course(self, db_session: Session, owner: User) -> None:
        classroom = new_space(db_session, owner=owner, kind=SpaceKind.CLASSROOM)
        # A co-teacher made the course, but the classroom owner still owns everything in the classroom.
        co_teacher = _member(db_session, classroom, SpaceRole.EDITOR)
        child = new_space(db_session, owner=co_teacher, parent=classroom)
        assert get_space_access(db_session, space_id=child.id, user_id=owner.id).role == SpaceRole.OWNER

    def test_own_row_wins_over_the_parent_row(self, db_session: Session, owner: User) -> None:
        classroom = new_space(db_session, owner=owner, kind=SpaceKind.CLASSROOM)
        child = new_space(db_session, owner=owner, parent=classroom)
        user = _member(db_session, classroom, SpaceRole.VIEWER)
        add_member(db_session, space=child, user=user, role=SpaceRole.EDITOR)
        assert get_space_access(db_session, space_id=child.id, user_id=user.id).role == SpaceRole.EDITOR

    def test_archived_parent_archives_the_child(self, db_session: Session, owner: User) -> None:
        classroom = new_space(db_session, owner=owner, kind=SpaceKind.CLASSROOM, space_status=SpaceStatus.ARCHIVED)
        child = new_space(db_session, owner=owner, parent=classroom)
        assert get_space_access(db_session, space_id=child.id, user_id=owner.id).status == SpaceStatus.ARCHIVED


# ---------------------------------------------------------------------------
# C5: services
# ---------------------------------------------------------------------------


class TestNoteAccess:
    def test_viewer_reads_published_but_not_a_draft(self, db_session: Session, owner: User, course: Space) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        published = new_note(db_session, user=owner, space=course)
        draft = new_note(db_session, user=owner, space=course, is_draft=True)

        assert note_service.get_note(db_session, note_id=published.id, current_user=viewer) is published
        assert _status_code(note_service.get_note, db_session, note_id=draft.id, current_user=viewer) == 403

    def test_viewer_can_not_write(self, db_session: Session, owner: User, course: Space) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        note = new_note(db_session, user=owner, space=course)
        data = NoteUpdate(title="New", version=note.version)

        assert (
            _status_code(note_service.update_note, db_session, note_id=note.id, current_user=viewer, data=data) == 403
        )

    @pytest.mark.parametrize("role", [SpaceRole.EDITOR, SpaceRole.OWNER])
    def test_editor_and_owner_edit_a_draft_only(
        self, db_session: Session, owner: User, course: Space, role: SpaceRole
    ) -> None:
        user = owner if role == SpaceRole.OWNER else _member(db_session, course, role)
        draft = new_note(db_session, user=owner, space=course, is_draft=True)
        published = new_note(db_session, user=owner, space=course)

        updated = note_service.update_note(
            db_session, note_id=draft.id, current_user=user, data=NoteUpdate(title="New", version=draft.version)
        )
        assert updated.title == "New"
        data = NoteUpdate(title="New", version=published.version)
        assert (
            _status_code(note_service.update_note, db_session, note_id=published.id, current_user=user, data=data)
            == 403
        )

    def test_non_member_can_not_read(self, db_session: Session, owner: User, course: Space) -> None:
        outsider = new_user(db_session)
        note = new_note(db_session, user=owner, space=course)
        assert _status_code(note_service.get_note, db_session, note_id=note.id, current_user=outsider) == 403

    def test_archived_space_is_read_only_for_the_owner(self, db_session: Session, owner: User) -> None:
        archived = new_space(db_session, owner=owner, space_status=SpaceStatus.ARCHIVED)
        draft = new_note(db_session, user=owner, space=archived, is_draft=True)

        assert note_service.get_note(db_session, note_id=draft.id, current_user=owner) is draft
        assert _status_code(note_service.get_live_note, db_session, note_id=draft.id, current_user=owner) == 403

    def test_missing_note_is_404(self, db_session: Session, owner: User) -> None:
        assert _status_code(note_service.get_note, db_session, note_id="missing", current_user=owner) == 404


class TestTestAndQuestionAccess:
    def test_viewer_reads_published_test_and_question(self, db_session: Session, owner: User, course: Space) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        test = new_test(db_session, user=owner, space=course)
        question = test.questions[0]

        assert test_service.get_test(db_session, test_id=test.id, current_user=viewer) is test
        assert question_service.get_question(db_session, question_id=question.id, current_user=viewer) is question

    def test_viewer_can_not_see_a_draft_test(self, db_session: Session, owner: User, course: Space) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        draft = new_test(db_session, user=owner, space=course, is_draft=True)
        assert _status_code(test_service.get_test, db_session, test_id=draft.id, current_user=viewer) == 403

    def test_viewer_can_not_write(self, db_session: Session, owner: User, course: Space) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        test = new_test(db_session, user=owner, space=course)
        question_id = test.questions[0].id

        assert _status_code(test_service.delete_test, db_session, test_id=test.id, current_user=viewer) == 403
        assert (
            _status_code(question_service.delete_question, db_session, question_id=question_id, current_user=viewer)
            == 403
        )

    def test_editor_edits_a_draft_test_only(self, db_session: Session, owner: User, course: Space) -> None:
        editor = _member(db_session, course, SpaceRole.EDITOR)
        draft = new_test(db_session, user=owner, space=course, is_draft=True)
        published = new_test(db_session, user=owner, space=course)

        question_service.delete_question(db_session, question_id=draft.questions[0].id, current_user=editor)
        assert _status_code(test_service.delete_test, db_session, test_id=published.id, current_user=editor) == 403

    def test_non_member_can_not_read(self, db_session: Session, owner: User, course: Space) -> None:
        outsider = new_user(db_session)
        test = new_test(db_session, user=owner, space=course)
        assert _status_code(test_service.get_test, db_session, test_id=test.id, current_user=outsider) == 403

    def test_archived_space_is_read_only_for_the_owner(self, db_session: Session, owner: User) -> None:
        archived = new_space(db_session, owner=owner, space_status=SpaceStatus.ARCHIVED)
        draft = new_test(db_session, user=owner, space=archived, is_draft=True)
        assert (
            _status_code(
                test_service.get_test, db_session, test_id=draft.id, current_user=owner, level=AccessLevel.EDIT
            )
            == 403
        )

    def test_check_does_not_add_srs_state_for_a_space_question(
        self, db_session: Session, owner: User, course: Space
    ) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        question = new_test(db_session, user=owner, space=course).questions[0]

        result = question_service.check_question(
            db_session, question_id=question.id, current_user=viewer, user_answer="ir"
        )

        assert result.srs_state is None
        assert db_session.scalars(select(UserQuestionState).where(UserQuestionState.user_id == viewer.id)).all() == []


# ---------------------------------------------------------------------------
# C7: personal-only guards
# ---------------------------------------------------------------------------


class TestPersonalOnlyGuards:
    """The owner edits drafts, so the access check passes and the personal-only guard decides."""

    @pytest.fixture
    def draft_note(self, db_session: Session, owner: User, course: Space) -> Note:
        return new_note(db_session, user=owner, space=course, is_draft=True)

    def test_move_note(self, db_session: Session, owner: User, draft_note: Note) -> None:
        assert (
            _status_code(note_service.move_note, db_session, note_id=draft_note.id, current_user=owner, folder_id=None)
            == 400
        )

    def test_favorite_note(self, db_session: Session, owner: User, draft_note: Note) -> None:
        assert (
            _status_code(
                note_service.set_favorite, db_session, note_id=draft_note.id, current_user=owner, is_favorite=True
            )
            == 400
        )

    def test_delete_note(self, db_session: Session, owner: User, draft_note: Note) -> None:
        assert _status_code(note_service.delete_note, db_session, note_id=draft_note.id, current_user=owner) == 400

    def test_restore_and_delete_forever(self, db_session: Session, owner: User, draft_note: Note) -> None:
        assert _status_code(trash_service.restore_note, db_session, note_id=draft_note.id, current_user=owner) == 400
        assert (
            _status_code(trash_service.hard_delete_note, db_session, note_id=draft_note.id, current_user=owner) == 400
        )

    def test_assign_and_duplicate_a_space_question(self, db_session: Session, owner: User, course: Space) -> None:
        space_question_id = new_test(db_session, user=owner, space=course, is_draft=True).questions[0].id
        personal_test = new_test(db_session, user=owner)

        assert (
            _status_code(
                question_service.assign_question_to_test,
                db_session,
                question_id=space_question_id,
                test_id=personal_test.id,
                current_user=owner,
            )
            == 400
        )
        assert (
            _status_code(
                question_service.duplicate_question, db_session, question_id=space_question_id, current_user=owner
            )
            == 400
        )

    def test_assign_a_bank_question_to_a_space_test(self, db_session: Session, owner: User, course: Space) -> None:
        bank_question = new_bank_question(db_session, user=owner)
        space_test = new_test(db_session, user=owner, space=course, is_draft=True)
        assert (
            _status_code(
                question_service.assign_question_to_test,
                db_session,
                question_id=bank_question.id,
                test_id=space_test.id,
                current_user=owner,
            )
            == 400
        )

    def test_bulk_delete_skips_space_questions(self, db_session: Session, owner: User, course: Space) -> None:
        space_question_id = new_test(db_session, user=owner, space=course, is_draft=True).questions[0].id
        bank_question = new_bank_question(db_session, user=owner)

        deleted = question_service.bulk_delete_questions(
            db_session, question_ids=[space_question_id, bank_question.id], current_user=owner
        )
        assert deleted == [bank_question.id]

    def test_bulk_assign_skips_space_questions(self, db_session: Session, owner: User, course: Space) -> None:
        space_question_id = new_test(db_session, user=owner, space=course, is_draft=True).questions[0].id
        bank_question = new_bank_question(db_session, user=owner)
        personal_test = new_test(db_session, user=owner)

        assigned = question_service.bulk_assign_questions(
            db_session,
            question_ids=[space_question_id, bank_question.id],
            test_id=personal_test.id,
            current_user=owner,
        )
        assert assigned == 1


# ---------------------------------------------------------------------------
# C8: AI tools
# ---------------------------------------------------------------------------


class TestAssistantTools:
    def test_viewer_reads_a_published_space_note(self, db_session: Session, owner: User, course: Space) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        note = new_note(db_session, user=owner, space=course, content="Mitochondria")
        db_session.commit()

        assert "Mitochondria" in _run(db_session, viewer, "get_note_content", note_id=note.id)

    def test_write_tools_refuse_published_space_content(self, db_session: Session, owner: User, course: Space) -> None:
        note = new_note(db_session, user=owner, space=course)
        test = new_test(db_session, user=owner, space=course)
        question_id = test.questions[0].id
        db_session.commit()

        # Each tool fails on the access check, before any AI call.
        assert _run(db_session, owner, "refine_note", note_id=note.id, instructions="x") == "Error: Access denied"
        assert _run(db_session, owner, "edit_test", test_id=test.id, title="New") == "Error: Access denied"
        output = _run(
            db_session, owner, "refine_questions", test_id=test.id, question_ids=[question_id], instructions="x"
        )
        assert output == "Error: Access denied"


# ---------------------------------------------------------------------------
# C9: exam guard, C10: versioning
# ---------------------------------------------------------------------------


class TestExamAndVersioning:
    def test_draft_test_can_not_be_taken(self, db_session: Session, owner: User, course: Space) -> None:
        draft = new_test(db_session, user=owner, space=course, is_draft=True)
        assert _status_code(test_service.get_takeable_test, db_session, test_id=draft.id, current_user=owner) == 409

    def test_published_space_test_can_be_taken_by_a_viewer(
        self, db_session: Session, owner: User, course: Space
    ) -> None:
        viewer = _member(db_session, course, SpaceRole.VIEWER)
        test = new_test(db_session, user=owner, space=course)
        assert test_service.get_takeable_test(db_session, test_id=test.id, current_user=viewer) is test

    def test_frozen_copy_keeps_the_space(self, db_session: Session, owner: User, course: Space) -> None:
        from app.models.test import Test
        from app.models.test_result import TestResult

        test = new_test(db_session, user=owner, space=course)
        db_session.add(TestResult(test_id=test.id, user_id=owner.id, total_questions=1, correct_answers=0))
        db_session.flush()

        assert version_test_if_needed(db_session, test=test) is True
        frozen = db_session.scalars(select(Test).where(Test.parent_id == test.id)).one()
        assert frozen.space_id == course.id
        assert frozen.is_draft is False
