"""DB tests for courses (ST-66 M2): structure, edit mode + publish, joining, archive, delete, duplicate.

Each test runs in one outer transaction that is rolled back (see `db_session` in `conftest.py`).
"""

from collections.abc import Callable, Sequence

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import MemberStatus, QuestionStatus, QuestionType, SpaceItemKind, SpaceRole, SpaceVisibility
from app.crud import test as test_crud
from app.models.answer import Answer
from app.models.note import Note
from app.models.question import Question
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_member import SpaceMember
from app.models.space_publish import SpacePublish
from app.models.space_section import SpaceSection

# Aliases: pytest tries to collect every class whose name starts with `Test`.
from app.models.test import Test as ExamTest
from app.models.test_result import TestResult as ResultRow
from app.models.user import User
from app.schemas.note import NoteUpdate
from app.schemas.question import QuestionCreate, QuestionUpdate
from app.schemas.space import (
    SpaceCreate,
    SpaceDetail,
    SpaceDraftOrder,
    SpaceDuplicateRequest,
    SpaceItemCopy,
    SpaceItemCreate,
    SpaceListStatus,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceSectionOrder,
    SpaceSectionUpdate,
)
from app.schemas.test import TestCreate, TestUpdate
from app.services import (
    note_service,
    question_service,
    space_draft_service,
    space_member_service,
    space_service,
    test_service,
)
from tests.space_factories import add_member, new_note, new_test, new_user

pytestmark = pytest.mark.db


def _status_code(service_call: Callable[..., object], db: Session, **kwargs: object) -> int:
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return exc_info.value.status_code


@pytest.fixture
def owner(db_session: Session) -> User:
    return new_user(db_session)


def _create_course(db: Session, owner: User, visibility: SpaceVisibility = SpaceVisibility.PUBLIC) -> SpaceDetail:
    return space_service.create_course(
        db, current_user=owner, data=SpaceCreate(title="Biology", tags=["Cells"], visibility=visibility)
    )


def _publish(db: Session, owner: User, space_id: str, **kwargs: object) -> SpaceDetail:
    return space_draft_service.publish(
        db, space_id=space_id, current_user=owner, data=SpacePublishRequest.model_validate(kwargs)
    )


def _course_with_note(db: Session, owner: User) -> tuple[SpaceDetail, str]:
    """A published PUBLIC course with one section and one note. Returns (detail, note id)."""
    course = _create_course(db, owner)
    course = space_draft_service.add_section(
        db, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="Intro")
    )
    assert course.draft_sections is not None
    section_id = course.draft_sections[0].id
    content = space_draft_service.create_item(
        db,
        space_id=course.id,
        current_user=owner,
        data=SpaceItemCreate(section_id=section_id, kind=SpaceItemKind.NOTE, title="Cells"),
    )
    assert content.note_id is not None
    return _publish(db, owner, course.id), content.note_id


def _rename_first_section(db: Session, owner: User, course: SpaceDetail) -> SpaceDetail:
    """A structure-only change, so publish has something to publish."""
    assert course.draft_sections is not None
    return space_draft_service.rename_section(
        db,
        space_id=course.id,
        section_id=course.draft_sections[0].id,
        current_user=owner,
        data=SpaceSectionUpdate(title="Renamed"),
    )


def _joined_viewer(db: Session, space_id: str) -> User:
    viewer = new_user(db)
    space_member_service.join(db, space_id=space_id, current_user=viewer)
    return viewer


def _published_items(db: Session, space_id: str) -> list[SpaceItem]:
    stmt = select(SpaceItem).where(SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(False))
    return list(db.scalars(stmt).all())


def _simple_question(prompt: str, answer: str) -> QuestionCreate:
    return QuestionCreate.model_validate(
        {"questionType": QuestionType.SIMPLE, "prompt": prompt, "content": {"answers": [answer]}}
    )


# ---------------------------------------------------------------------------
# C1: create, structure, copy in, publish
# ---------------------------------------------------------------------------


class TestCreateAndPublish:
    def test_new_course_starts_in_edit_mode_with_a_join_code(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner)

        assert course.is_editing and course.can_edit and course.is_owner
        assert course.join_code is not None and len(course.join_code) == 7
        assert course.published_at is None
        assert course.tags == ["cells"]

    def test_publish_makes_draft_content_visible(self, db_session: Session, owner: User) -> None:
        course, note_id = _course_with_note(db_session, owner)

        assert not course.is_editing
        assert course.draft_sections is None
        assert [s.title for s in course.sections] == ["Intro"]
        assert course.sections[0].items[0].note_id == note_id
        note = db_session.get(Note, note_id)
        assert note is not None and note.is_draft is False
        assert (
            db_session.scalars(
                select(SpaceSection).where(SpaceSection.space_id == course.id, SpaceSection.is_draft.is_(True))
            ).all()
            == []
        )

    def test_copy_in_makes_a_new_note_with_no_link(self, db_session: Session, owner: User) -> None:
        personal = new_note(db_session, user=owner, content="mitosis")
        course = _create_course(db_session, owner)
        course = space_draft_service.add_section(
            db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
        )
        assert course.draft_sections is not None

        content = space_draft_service.copy_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=course.draft_sections[0].id, note_id=personal.id),
        )

        copy = db_session.get(Note, content.note_id)
        assert copy is not None and copy.id != personal.id
        assert copy.content == "mitosis" and copy.space_id == course.id and copy.is_draft
        assert copy.draft_of_id is None

    def test_copy_in_of_a_test_clears_the_origin_links(self, db_session: Session, owner: User) -> None:
        personal = new_test(db_session, user=owner)
        course = _create_course(db_session, owner)
        course = space_draft_service.add_section(
            db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
        )
        assert course.draft_sections is not None

        content = space_draft_service.copy_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=course.draft_sections[0].id, test_id=personal.id),
        )

        copy = test_crud.get_by_id(db_session, id=content.test_id or "")
        assert copy is not None and copy.space_id == course.id and copy.is_draft
        assert copy.parent_id is None and copy.source_note_id is None
        assert [q.origin_id for q in copy.questions] == [None]

    def test_copy_in_refuses_content_of_another_user(self, db_session: Session, owner: User) -> None:
        stranger_note = new_note(db_session, user=new_user(db_session))
        course = _create_course(db_session, owner)
        course = space_draft_service.add_section(
            db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
        )
        assert course.draft_sections is not None

        code = _status_code(
            space_draft_service.copy_item,
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=course.draft_sections[0].id, note_id=stranger_note.id),
        )
        assert code == 403

    def test_viewer_can_not_edit_the_structure(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        viewer = _joined_viewer(db_session, course.id)

        code = _status_code(space_draft_service.enter_edit_mode, db_session, space_id=course.id, current_user=viewer)
        assert code == 403

    def test_reorder_needs_every_row(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.draft_sections is not None
        section = course.draft_sections[0]

        code = _status_code(
            space_draft_service.reorder,
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceDraftOrder(sections=[SpaceSectionOrder(id=section.id, item_ids=[])]),
        )
        assert code == 400


# ---------------------------------------------------------------------------
# C2-C5: twins, publish, discard
# ---------------------------------------------------------------------------


class TestDraftEngine:
    def test_note_twin_is_hidden_until_publish(self, db_session: Session, owner: User) -> None:
        course, note_id = _course_with_note(db_session, owner)
        viewer = _joined_viewer(db_session, course.id)
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.draft_sections is not None
        item = course.draft_sections[0].items[0]

        twin_id = space_draft_service.make_editable(
            db_session, space_id=course.id, item_id=item.id, current_user=owner
        ).note_id
        assert twin_id is not None and twin_id != note_id
        # A second call returns the same twin.
        again = space_draft_service.make_editable(db_session, space_id=course.id, item_id=item.id, current_user=owner)
        assert again.note_id == twin_id

        twin = note_service.get_note(db_session, note_id=twin_id, current_user=owner)
        note_service.update_note(
            db_session, note_id=twin_id, current_user=owner, data=NoteUpdate(content="new", version=twin.version)
        )
        assert note_service.get_note(db_session, note_id=note_id, current_user=viewer).content == ""
        assert _status_code(note_service.get_note, db_session, note_id=twin_id, current_user=viewer) == 403

        _publish(db_session, owner, course.id)

        published = note_service.get_note(db_session, note_id=note_id, current_user=viewer)
        assert published.content == "new"
        assert published.version == 2 and published.is_indexed is False
        assert db_session.get(Note, twin_id) is None

    def test_test_twin_publish_freezes_old_results(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner)
        course = space_draft_service.add_section(
            db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
        )
        assert course.draft_sections is not None
        test_id = space_draft_service.copy_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=course.draft_sections[0].id, test_id=new_test(db_session, user=owner).id),
        ).test_id
        assert test_id is not None
        course = _publish(db_session, owner, course.id)

        viewer = _joined_viewer(db_session, course.id)
        old_question = test_service.get_takeable_test(db_session, test_id=test_id, current_user=viewer).questions[0]
        result = ResultRow(test_id=test_id, user_id=viewer.id, total_questions=1, correct_answers=1)
        db_session.add(result)
        db_session.flush()
        db_session.add(Answer(test_result_id=result.id, question_id=old_question.id, user_answer="ir"))
        db_session.flush()

        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.draft_sections is not None
        twin_id = space_draft_service.make_editable(
            db_session, space_id=course.id, item_id=course.draft_sections[0].items[0].id, current_user=owner
        ).test_id
        assert twin_id is not None and twin_id != test_id
        test_service.update_test(
            db_session,
            test_id=twin_id,
            current_user=owner,
            data=TestUpdate(title="New", questions=[_simple_question("to come", "venir")]),
        )
        _publish(db_session, owner, course.id)
        db_session.expire_all()

        published = test_service.get_takeable_test(db_session, test_id=test_id, current_user=viewer)
        assert published.title == "New"
        assert [q.prompt for q in published.questions] == ["to come"]
        frozen_result = db_session.get(ResultRow, result.id)
        assert frozen_result is not None and frozen_result.test_id != test_id
        frozen = db_session.get(ExamTest, frozen_result.test_id)
        assert frozen is not None and frozen.parent_id == test_id
        assert db_session.get(ExamTest, twin_id) is None

    def test_second_publish_freezes_only_active_questions(self, db_session: Session, owner: User) -> None:
        """The first publish retires the old questions (DELETED). The next frozen copy must not copy them."""
        course = _create_course(db_session, owner)
        course = space_draft_service.add_section(
            db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
        )
        assert course.draft_sections is not None
        test_id = space_draft_service.copy_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=course.draft_sections[0].id, test_id=new_test(db_session, user=owner).id),
        ).test_id
        assert test_id is not None
        course = _publish(db_session, owner, course.id)
        viewer = _joined_viewer(db_session, course.id)
        # The session holds the published test with ALL its questions (also DELETED), as a caller that
        # read `test.questions` through the lazy relationship does. The identity map is weak: without
        # this strong reference the object would be dropped before publish and the bug would not show.
        held = db_session.get(ExamTest, test_id)
        assert held is not None

        def edit_and_publish(prompt: str) -> str:
            """Add a member result, edit the twin to one question `prompt`, publish. Returns the frozen test id."""
            result = ResultRow(test_id=test_id, user_id=viewer.id, total_questions=1, correct_answers=1)
            db_session.add(result)
            db_session.flush()
            detail = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
            assert detail.draft_sections is not None
            twin_id = space_draft_service.make_editable(
                db_session, space_id=course.id, item_id=detail.draft_sections[0].items[0].id, current_user=owner
            ).test_id
            assert twin_id is not None
            test_service.update_test(
                db_session,
                test_id=twin_id,
                current_user=owner,
                data=TestUpdate(questions=[_simple_question(prompt, "x")]),
            )
            assert len(held.questions) >= 1  # load the unfiltered collection again (the commit expired it)
            _publish(db_session, owner, course.id)
            db_session.refresh(result)
            return result.test_id

        edit_and_publish("first")
        newest_frozen_id = edit_and_publish("second")

        frozen = db_session.scalars(select(Question).where(Question.test_id == newest_frozen_id)).all()
        assert [(q.prompt, q.status) for q in frozen] == [("first", int(QuestionStatus.ACTIVE))]

    def test_discard_restores_the_published_state(self, db_session: Session, owner: User) -> None:
        course, note_id = _course_with_note(db_session, owner)
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.draft_sections is not None
        section = course.draft_sections[0]
        space_draft_service.make_editable(
            db_session, space_id=course.id, item_id=section.items[0].id, current_user=owner
        )
        space_draft_service.create_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCreate(section_id=section.id, kind=SpaceItemKind.TEST, title="Quiz"),
        )
        space_draft_service.delete_section(db_session, space_id=course.id, section_id=section.id, current_user=owner)

        course = space_draft_service.discard(db_session, space_id=course.id, current_user=owner)

        assert not course.is_editing
        assert [i.note_id for s in course.sections for i in s.items] == [note_id]
        assert db_session.scalars(select(Note).where(Note.space_id == course.id, Note.is_draft.is_(True))).all() == []
        assert db_session.scalars(select(ExamTest).where(ExamTest.space_id == course.id)).all() == []
        assert (
            db_session.scalars(
                select(SpaceItem).where(SpaceItem.space_id == course.id, SpaceItem.is_draft.is_(True))
            ).all()
            == []
        )

    def test_publish_removes_deleted_items_and_logs(self, db_session: Session, owner: User) -> None:
        course, note_id = _course_with_note(db_session, owner)
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.draft_sections is not None
        item = course.draft_sections[0].items[0]
        space_draft_service.delete_item(db_session, space_id=course.id, item_id=item.id, current_user=owner)

        course = _publish(
            db_session, owner, course.id, message="Cleanup", notifyMembers=True, resetItemIds=[item.id, "unknown"]
        )

        assert course.sections[0].items == []
        assert db_session.get(Note, note_id) is None
        log = db_session.scalars(select(SpacePublish).where(SpacePublish.space_id == course.id)).all()
        assert [(row.message, row.notify_members) for row in log] == [(None, False), ("Cleanup", True)]
        # The deleted item has no published id any more, so the reset list is empty.
        assert log[1].reset_item_ids == []

    def test_reset_item_ids_are_stored_as_published_ids(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.draft_sections is not None
        draft_item = course.draft_sections[0].items[0]
        _rename_first_section(db_session, owner, course)

        _publish(db_session, owner, course.id, resetItemIds=[draft_item.id])

        log = db_session.scalars(select(SpacePublish).where(SpacePublish.space_id == course.id)).all()
        assert log[-1].reset_item_ids == [draft_item.draft_of_id]


# ---------------------------------------------------------------------------
# C6-C8: joining, members, archive
# ---------------------------------------------------------------------------


class TestMembers:
    def test_never_published_course_can_not_be_joined(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner)
        user = new_user(db_session)

        assert _status_code(space_member_service.join, db_session, space_id=course.id, current_user=user) == 409

    def test_private_link_makes_a_request_and_code_joins(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner, visibility=SpaceVisibility.PRIVATE)
        _publish(db_session, owner, course.id)
        requester, coder = new_user(db_session), new_user(db_session)

        requested = space_member_service.join(db_session, space_id=course.id, current_user=requester)
        assert requested.my_role is None and requested.my_status == MemberStatus.REQUESTED

        assert course.join_code is not None
        joined = space_member_service.join_by_code(db_session, code=course.join_code.upper(), current_user=coder)
        assert joined.my_role == SpaceRole.VIEWER

        space_member_service.approve_request(db_session, space_id=course.id, user_id=requester.id, current_user=owner)
        approved = space_service.get_course(db_session, space_id=course.id, current_user=requester)
        assert approved.my_role == SpaceRole.VIEWER

    def test_private_course_is_hidden_from_strangers(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner, visibility=SpaceVisibility.PRIVATE)
        _publish(db_session, owner, course.id)
        stranger = new_user(db_session)

        code = _status_code(space_service.get_course, db_session, space_id=course.id, current_user=stranger)
        assert code == 403

    def test_catalog_lists_public_published_courses_only(self, db_session: Session, owner: User) -> None:
        public = _create_course(db_session, owner)
        _publish(db_session, owner, public.id)
        unlisted = _create_course(db_session, owner, visibility=SpaceVisibility.UNLISTED)
        _publish(db_session, owner, unlisted.id)

        items, _ = space_service.list_catalog(
            db_session, current_user=owner, search="biology cells", sort="newest", page=1, per_page=100
        )
        ids = {s.id for s in items}
        assert public.id in ids and unlisted.id not in ids

    def test_invite_accept_and_leave(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner)
        _publish(db_session, owner, course.id)
        guest = new_user(db_session)

        space_member_service.invite(db_session, space_id=course.id, current_user=owner, identifier=guest.email)
        assert [s.id for s in space_service.list_invitations(db_session, current_user=guest)] == [course.id]

        accepted = space_member_service.accept_invitation(db_session, space_id=course.id, current_user=guest)
        assert accepted.my_role == SpaceRole.VIEWER
        assert [s.id for s in space_service.list_my_courses(db_session, current_user=guest)] == [course.id]

        space_member_service.leave(db_session, space_id=course.id, current_user=guest)
        assert db_session.get(SpaceMember, (course.id, guest.id)) is None

    def test_owner_can_not_leave(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner)
        assert _status_code(space_member_service.leave, db_session, space_id=course.id, current_user=owner) == 400

    def test_archived_course_is_read_only(self, db_session: Session, owner: User) -> None:
        course, note_id = _course_with_note(db_session, owner)
        viewer = _joined_viewer(db_session, course.id)
        space_service.set_archived(db_session, space_id=course.id, current_user=owner, archived=True)

        assert note_service.get_note(db_session, note_id=note_id, current_user=viewer).id == note_id
        newcomer = new_user(db_session)
        assert _status_code(space_member_service.join, db_session, space_id=course.id, current_user=newcomer) == 409
        assert (
            _status_code(space_draft_service.enter_edit_mode, db_session, space_id=course.id, current_user=owner) == 409
        )
        # The owner still removes members.
        space_member_service.remove_member(db_session, space_id=course.id, user_id=viewer.id, current_user=owner)
        assert db_session.get(SpaceMember, (course.id, viewer.id)) is None

    def test_editor_role_allows_authoring(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        member = _joined_viewer(db_session, course.id)

        space_member_service.set_role(
            db_session, space_id=course.id, user_id=member.id, current_user=owner, role=SpaceRole.EDITOR
        )

        assert space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=member).is_editing

    def test_archived_course_keeps_its_join_code(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        space_service.set_archived(db_session, space_id=course.id, current_user=owner, archived=True)

        code = _status_code(space_service.regenerate_join_code, db_session, space_id=course.id, current_user=owner)
        assert code == 409


class TestCourseContentGuards:
    def test_draft_course_test_can_not_be_deleted_directly(self, db_session: Session, owner: User) -> None:
        # The course item removes it. A direct delete would leave a course item to a deleted test.
        course = _create_course(db_session, owner)
        space = db_session.get(Space, course.id)
        assert space is not None
        test = new_test(db_session, user=owner, space=space, is_draft=True)

        assert _status_code(test_service.delete_test, db_session, test_id=test.id, current_user=owner) == 400

    def test_draft_note_can_not_be_a_test_source(self, db_session: Session, owner: User) -> None:
        # Publish deletes the draft twin, so the link would become NULL.
        course = _create_course(db_session, owner)
        space = db_session.get(Space, course.id)
        assert space is not None
        draft_note = new_note(db_session, user=owner, space=space, is_draft=True)

        code = _status_code(
            test_service.create_test,
            db_session,
            current_user=owner,
            data=TestCreate(title="Quiz", source_note_id=draft_note.id),
        )
        assert code == 400


# ---------------------------------------------------------------------------
# C9, C11: delete forever, duplicate
# ---------------------------------------------------------------------------


class TestDeleteAndDuplicate:
    def test_delete_forever_needs_the_exact_title(self, db_session: Session, owner: User) -> None:
        course = _create_course(db_session, owner)

        code = _status_code(
            space_service.delete_course_forever,
            db_session,
            space_id=course.id,
            current_user=owner,
            confirm_title="biology",
        )
        assert code == 400

    def test_delete_forever_removes_tests_with_results(self, db_session: Session, owner: User) -> None:
        """P1-1: the test children have no DB cascade, so the service deletes them first."""
        course, note_id = _course_with_note(db_session, owner)
        space = db_session.get(Space, course.id)
        assert space is not None
        member = new_user(db_session)
        add_member(db_session, space=space, user=member, role=SpaceRole.VIEWER)
        test = new_test(db_session, user=owner, space=space)
        question_id = test.questions[0].id
        result = ResultRow(test_id=test.id, user_id=member.id, total_questions=1, correct_answers=1)
        db_session.add(result)
        db_session.flush()
        db_session.add(Answer(test_result_id=result.id, question_id=question_id, user_answer="ir"))
        # A personal test of the member made from a course note.
        personal = ExamTest(user_id=member.id, title="Mine", source_note_id=note_id)
        db_session.add(personal)
        db_session.flush()

        space_service.delete_course_forever(db_session, space_id=course.id, current_user=owner, confirm_title="Biology")
        db_session.expire_all()

        assert db_session.get(Space, course.id) is None
        assert db_session.get(ExamTest, test.id) is None
        assert db_session.get(Question, question_id) is None
        assert db_session.get(ResultRow, result.id) is None
        survivor = db_session.get(ExamTest, personal.id)
        assert survivor is not None and survivor.source_note_id is None

    def test_duplicate_copies_published_content_only(self, db_session: Session, owner: User) -> None:
        course, note_id = _course_with_note(db_session, owner)
        _joined_viewer(db_session, course.id)
        editing = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert editing.draft_sections is not None
        space_draft_service.add_section(
            db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="Unpublished")
        )
        other = new_user(db_session)

        body = SpaceDuplicateRequest(title="Biology II", description="Copy", tags=["Copy"])
        assert (
            _status_code(space_service.duplicate_course, db_session, space_id=course.id, current_user=other, data=body)
            == 403
        )
        copy = space_service.duplicate_course(db_session, space_id=course.id, current_user=owner, data=body)

        assert copy.id != course.id and copy.is_editing and copy.member_count == 0
        assert (copy.title, copy.description, copy.tags) == ("Biology II", "Copy", ["copy"])
        assert copy.visibility == SpaceVisibility.PRIVATE
        assert copy.draft_sections is not None
        assert [s.title for s in copy.draft_sections] == ["Intro"]
        copied_note_id = copy.draft_sections[0].items[0].note_id
        assert copied_note_id is not None and copied_note_id != note_id
        assert copy.sections == []


def test_question_of_a_published_course_test_stays_active(db_session: Session, owner: User) -> None:
    """Publish with no change to the test keeps the questions of a published test as they are."""
    course = _create_course(db_session, owner)
    course = space_draft_service.add_section(
        db_session, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
    )
    assert course.draft_sections is not None
    test_id = space_draft_service.create_item(
        db_session,
        space_id=course.id,
        current_user=owner,
        data=SpaceItemCreate(section_id=course.draft_sections[0].id, kind=SpaceItemKind.TEST, title="Quiz"),
    ).test_id
    assert test_id is not None
    test_service.update_test(
        db_session, test_id=test_id, current_user=owner, data=TestUpdate(questions=[_simple_question("a", "b")])
    )
    _publish(db_session, owner, course.id)
    editing = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
    _rename_first_section(db_session, owner, editing)
    _publish(db_session, owner, course.id)

    statuses = db_session.scalars(select(Question.status).where(Question.test_id == test_id)).all()
    assert list(statuses) == [int(QuestionStatus.ACTIVE)]
    assert [i.test_id for i in _published_items(db_session, course.id)] == [test_id]


# ---------------------------------------------------------------------------
# M2 UI pass: unpublished changes, list filters, question locks
# ---------------------------------------------------------------------------


def _course_with_test(db: Session, owner: User) -> tuple[SpaceDetail, str]:
    """A published course with one test of one question. Returns (detail in edit mode, draft item id)."""
    course = _create_course(db, owner)
    course = space_draft_service.add_section(
        db, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
    )
    assert course.draft_sections is not None
    test_id = space_draft_service.create_item(
        db,
        space_id=course.id,
        current_user=owner,
        data=SpaceItemCreate(section_id=course.draft_sections[0].id, kind=SpaceItemKind.TEST, title="Quiz"),
    ).test_id
    assert test_id is not None
    test_service.update_test(
        db, test_id=test_id, current_user=owner, data=TestUpdate(questions=[_simple_question("a", "b")])
    )
    _publish(db, owner, course.id)
    course = space_draft_service.enter_edit_mode(db, space_id=course.id, current_user=owner)
    assert course.draft_sections is not None
    return course, course.draft_sections[0].items[0].id


class TestUnpublishedChanges:
    def test_new_course_has_changes(self, db_session: Session, owner: User) -> None:
        assert _create_course(db_session, owner).has_unpublished_changes is True

    def test_edit_mode_with_no_change_can_not_publish(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        assert course.has_unpublished_changes is False
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.has_unpublished_changes is False
        assert (
            _status_code(
                space_draft_service.publish,
                db_session,
                space_id=course.id,
                current_user=owner,
                data=SpacePublishRequest(),
            )
            == 409
        )

    def test_structure_change_is_a_change(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert _rename_first_section(db_session, owner, course).has_unpublished_changes is True

    def test_note_twin_counts_only_when_its_content_changes(self, db_session: Session, owner: User) -> None:
        course, _ = _course_with_note(db_session, owner)
        course = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert course.draft_sections is not None
        item_id = course.draft_sections[0].items[0].id
        twin_id = space_draft_service.make_editable(
            db_session, space_id=course.id, item_id=item_id, current_user=owner
        ).note_id
        assert twin_id is not None
        detail = space_service.get_course(db_session, space_id=course.id, current_user=owner)
        assert detail.has_unpublished_changes is False

        twin = note_service.get_note(db_session, note_id=twin_id, current_user=owner)
        note_service.update_note(
            db_session, note_id=twin_id, current_user=owner, data=NoteUpdate(content="new", version=twin.version)
        )
        detail = space_service.get_course(db_session, space_id=course.id, current_user=owner)
        assert detail.has_unpublished_changes is True

    def test_test_twin_counts_only_when_its_questions_change(self, db_session: Session, owner: User) -> None:
        course, item_id = _course_with_test(db_session, owner)
        twin_id = space_draft_service.make_editable(
            db_session, space_id=course.id, item_id=item_id, current_user=owner
        ).test_id
        assert twin_id is not None
        detail = space_service.get_course(db_session, space_id=course.id, current_user=owner)
        assert detail.has_unpublished_changes is False

        test_service.update_test(
            db_session, test_id=twin_id, current_user=owner, data=TestUpdate(questions=[_simple_question("a", "c")])
        )
        detail = space_service.get_course(db_session, space_id=course.id, current_user=owner)
        assert detail.has_unpublished_changes is True

    def test_question_edit_on_a_test_twin_is_a_change(self, db_session: Session, owner: User) -> None:
        """`update_question` locks the course test and goes through the access layer."""
        course, item_id = _course_with_test(db_session, owner)
        twin_id = space_draft_service.make_editable(
            db_session, space_id=course.id, item_id=item_id, current_user=owner
        ).test_id
        assert twin_id is not None
        twin = test_service.get_test(db_session, test_id=twin_id, current_user=owner)
        question_service.update_question(
            db_session, question_id=twin.questions[0].id, current_user=owner, data=QuestionUpdate(prompt="new")
        )
        detail = space_service.get_course(db_session, space_id=course.id, current_user=owner)
        assert detail.has_unpublished_changes is True


def _my_course_ids(
    db: Session,
    user: User,
    *,
    status: SpaceListStatus = "active",
    visibility: Sequence[SpaceVisibility] = (),
    roles: Sequence[SpaceRole] = (),
) -> set[str]:
    courses = space_service.list_my_courses(
        db, current_user=user, list_status=status, visibility=visibility, roles=roles
    )
    return {course.id for course in courses}


class TestMyCoursesFilters:
    def test_archived_is_hidden_by_default(self, db_session: Session, owner: User) -> None:
        active, _ = _course_with_note(db_session, owner)
        archived, _ = _course_with_note(db_session, owner)
        space_service.set_archived(db_session, space_id=archived.id, current_user=owner, archived=True)

        assert _my_course_ids(db_session, owner) == {active.id}
        assert _my_course_ids(db_session, owner, status="archived") == {archived.id}
        assert _my_course_ids(db_session, owner, status="all") == {active.id, archived.id}

    def test_role_and_visibility_filters(self, db_session: Session, owner: User) -> None:
        own = _create_course(db_session, owner, SpaceVisibility.PRIVATE)
        other_owner = new_user(db_session)
        joined, _ = _course_with_note(db_session, other_owner)
        space_member_service.join(db_session, space_id=joined.id, current_user=owner)

        assert _my_course_ids(db_session, owner, roles=[SpaceRole.OWNER]) == {own.id}
        assert _my_course_ids(db_session, owner, roles=[SpaceRole.VIEWER]) == {joined.id}
        assert _my_course_ids(db_session, owner, roles=[SpaceRole.OWNER, SpaceRole.VIEWER]) == {own.id, joined.id}
        assert _my_course_ids(db_session, owner, visibility=[SpaceVisibility.PUBLIC]) == {joined.id}
