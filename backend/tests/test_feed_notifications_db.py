"""ST-69 M5: the classroom Stream feed (posts/comments) and notifications (real DB, each test is rolled back)."""

import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import NOTIFICATION_RETENTION_DAYS
from app.core.enums import (
    FeedPermission,
    MemberStatus,
    NotificationType,
    SpaceItemKind,
    SpaceKind,
    SpaceRole,
    SpaceVisibility,
)
from app.crud import notification as notification_crud
from app.models.answer import Answer
from app.models.notification import Notification
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.space import (
    ClassroomCourseCreate,
    ClassroomCreate,
    ClassroomSettingsUpdate,
    SpaceCreate,
    SpaceItemCopy,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceSectionUpdate,
)
from app.schemas.space_feed import SpaceCommentCreate, SpaceCommentUpdate, SpacePostCreate, SpacePostUpdate
from app.services import (
    classroom_service,
    grade_override_service,
    notification_service,
    space_attempt_service,
    space_draft_service,
    space_feed_service,
    space_member_service,
    space_service,
)
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


@pytest.fixture
def owner(db_session: Session) -> User:
    return new_user(db_session)


# ── Builders ──────────────────────────────────────────────────────────────────


def _classroom(db: Session, owner: User) -> str:
    return classroom_service.create_classroom(db, current_user=owner, data=ClassroomCreate(title="Class")).id


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


def _set_feed_permission(db: Session, owner: User, classroom_id: str, permission: FeedPermission) -> None:
    classroom_service.update_settings(
        db, classroom_id=classroom_id, current_user=owner, data=ClassroomSettingsUpdate(feed_permission=permission)
    )


def _post(db: Session, classroom_id: str, author: User, body: str = "Hello class") -> str:
    data = SpacePostCreate(body=body)
    created = space_feed_service.create_post(db, space_id=classroom_id, current_user=author, data=data)
    return created.id


def _comment(db: Session, post_id: str, author: User, body: str = "A comment") -> str:
    data = SpaceCommentCreate(body=body)
    created = space_feed_service.create_comment(db, post_id=post_id, current_user=author, data=data)
    return created.id


def _notifications_of(db: Session, user: User) -> list[Notification]:
    return list(db.scalars(select(Notification).where(Notification.user_id == user.id)))


def _section(db: Session, user: User, space_id: str) -> str:
    detail = space_draft_service.add_section(
        db, space_id=space_id, current_user=user, data=SpaceSectionCreate(title="S")
    )
    assert detail.draft_sections
    return detail.draft_sections[-1].id


def _publish_a_note(db: Session, user: User, space_id: str) -> None:
    """Put one note in a new course (it starts in edit mode) and publish, so that the course can be joined."""
    section_id = _section(db, user, space_id)
    space_draft_service.copy_item(
        db,
        space_id=space_id,
        current_user=user,
        data=SpaceItemCopy(section_id=section_id, note_id=new_note(db, user=user).id),
    )
    space_draft_service.publish(db, space_id=space_id, current_user=user, data=SpacePublishRequest.model_validate({}))


def _published_items(db: Session, space_id: str) -> list[SpaceItem]:
    stmt = select(SpaceItem).where(SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(False))
    return list(db.scalars(stmt).all())


def _loose_test_classroom(db: Session, owner: User) -> tuple[str, str]:
    """A published classroom with one loose TEST item ("to go" -> "ir"). Returns (classroom_id, item_id)."""
    classroom_id = _classroom(db, owner)
    section_id = _section(db, owner, classroom_id)
    space_draft_service.copy_item(
        db,
        space_id=classroom_id,
        current_user=owner,
        data=SpaceItemCopy(section_id=section_id, test_id=new_test(db, user=owner).id),
    )
    space_draft_service.publish(
        db, space_id=classroom_id, current_user=owner, data=SpacePublishRequest.model_validate({})
    )
    return classroom_id, _published_items(db, classroom_id)[0].id


def _take_wrong(db: Session, classroom_id: str, item_id: str, student: User) -> str:
    """Start and submit a wrong answer. Returns the answer id."""
    start = space_attempt_service.start_attempt(db, space_id=classroom_id, item_id=item_id, current_user=student)
    assert start.attempt_id is not None
    result = space_attempt_service.submit_attempt(
        db,
        space_id=classroom_id,
        attempt_id=start.attempt_id,
        current_user=student,
        submission=TestSubmission.model_validate(
            {"answers": [{"question_id": q.id, "user_answer": "wrong"} for q in start.test.questions]}
        ),
        background_tasks=BackgroundTasks(),
    )
    return db.scalars(select(Answer).where(Answer.test_result_id == result.id)).one().id  # type: ignore[union-attr]


# ── Feed permissions ───────────────────────────────────────────────────────────


class TestFeedPermissions:
    @pytest.mark.parametrize(
        ("permission", "student_can_post", "student_can_comment"),
        [
            (FeedPermission.TEACHERS_ONLY, False, False),
            (FeedPermission.STUDENTS_COMMENT, False, True),
            (FeedPermission.STUDENTS_POST_AND_COMMENT, True, True),
        ],
    )
    def test_student_permission_matrix(
        self,
        db_session: Session,
        owner: User,
        permission: FeedPermission,
        student_can_post: bool,
        student_can_comment: bool,
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, permission)
        student = _student(db_session, classroom_id)

        if student_can_post:
            post_id = _post(db_session, classroom_id, student)
        else:
            assert (
                _detail(
                    space_feed_service.create_post,
                    db_session,
                    space_id=classroom_id,
                    current_user=student,
                    data=SpacePostCreate(body="hi"),
                )
                == "Only the teacher can post in this classroom"
            )
            post_id = _post(db_session, classroom_id, owner)

        if student_can_comment:
            _comment(db_session, post_id, student)
        else:
            assert (
                _detail(
                    space_feed_service.create_comment,
                    db_session,
                    post_id=post_id,
                    current_user=student,
                    data=SpaceCommentCreate(body="hi"),
                )
                == "Only the teacher can comment in this classroom"
            )

    @pytest.mark.parametrize(
        ("permission", "student_can_post", "student_can_comment"),
        [
            (FeedPermission.TEACHERS_ONLY, False, False),
            (FeedPermission.STUDENTS_COMMENT, False, True),
            (FeedPermission.STUDENTS_POST_AND_COMMENT, True, True),
        ],
    )
    def test_the_page_tells_which_composers_to_show(
        self,
        db_session: Session,
        owner: User,
        permission: FeedPermission,
        student_can_post: bool,
        student_can_comment: bool,
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, permission)
        student = _student(db_session, classroom_id)

        def flags(user: User) -> tuple[bool, bool]:
            page = space_feed_service.list_posts(
                db_session, space_id=classroom_id, current_user=user, cursor=None, limit=20
            )
            return page.can_post, page.can_comment

        assert flags(student) == (student_can_post, student_can_comment)
        assert flags(owner) == (True, True)

    def test_the_teacher_and_the_owner_always_post_and_comment(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.TEACHERS_ONLY)
        teacher = _teacher(db_session, classroom_id)
        post_id = _post(db_session, classroom_id, teacher)
        _comment(db_session, post_id, owner)


# ── Feed access ────────────────────────────────────────────────────────────────


class TestFeedAccess:
    def test_a_stranger_is_refused(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        stranger = new_user(db_session)
        assert (
            _status_code(
                space_feed_service.list_posts,
                db_session,
                space_id=classroom_id,
                current_user=stranger,
                cursor=None,
                limit=20,
            )
            == 403
        )
        assert (
            _status_code(
                space_feed_service.create_post,
                db_session,
                space_id=classroom_id,
                current_user=stranger,
                data=SpacePostCreate(body="hi"),
            )
            == 403
        )

    def test_an_archived_classroom_is_read_only(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        post_id = _post(db_session, classroom_id, owner)
        space_service.set_archived(db_session, space_id=classroom_id, current_user=owner, archived=True)

        assert (
            _detail(
                space_feed_service.create_post,
                db_session,
                space_id=classroom_id,
                current_user=owner,
                data=SpacePostCreate(body="hi"),
            )
            == "The classroom is archived"
        )
        assert (
            _detail(
                space_feed_service.create_comment,
                db_session,
                post_id=post_id,
                current_user=owner,
                data=SpaceCommentCreate(body="hi"),
            )
            == "The classroom is archived"
        )
        page = space_feed_service.list_posts(
            db_session, space_id=classroom_id, current_user=owner, cursor=None, limit=20
        )
        assert [p.id for p in page.items] == [post_id]
        # The Stream hides both composers, even for the owner.
        assert (page.can_post, page.can_comment) == (False, False)

    def test_an_archived_classroom_hides_edit_and_delete(self, db_session: Session, owner: User) -> None:
        """`can_edit` / `can_delete` follow `writable`: the buttons must not show when the API gives 409."""
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        student = _student(db_session, classroom_id)
        post_id = _post(db_session, classroom_id, student)
        _comment(db_session, post_id, student)

        def flags(viewer: User) -> list[tuple[bool, bool]]:
            page = space_feed_service.list_posts(
                db_session, space_id=classroom_id, current_user=viewer, cursor=None, limit=20
            )
            post = page.items[0]
            return [(post.can_edit, post.can_delete), (post.comments[0].can_edit, post.comments[0].can_delete)]

        assert flags(student) == [(True, True), (True, True)]
        assert flags(owner) == [(False, True), (False, True)]

        space_service.set_archived(db_session, space_id=classroom_id, current_user=owner, archived=True)

        assert flags(student) == [(False, False), (False, False)]
        assert flags(owner) == [(False, False), (False, False)]


# ── Moderation ─────────────────────────────────────────────────────────────────


class TestFeedModeration:
    def test_the_author_edits_and_deletes_own_post(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        student = _student(db_session, classroom_id)
        post_id = _post(db_session, classroom_id, student)

        updated = space_feed_service.update_post(
            db_session, post_id=post_id, current_user=student, data=SpacePostUpdate(body="edited")
        )
        assert updated.body == "edited" and updated.can_edit is True

        space_feed_service.delete_post(db_session, post_id=post_id, current_user=student)
        page = space_feed_service.list_posts(
            db_session, space_id=classroom_id, current_user=student, cursor=None, limit=20
        )
        assert page.items == []

    def test_another_student_cannot_edit_or_delete(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        author = _student(db_session, classroom_id)
        other = _student(db_session, classroom_id)
        post_id = _post(db_session, classroom_id, author)

        assert (
            _detail(
                space_feed_service.update_post,
                db_session,
                post_id=post_id,
                current_user=other,
                data=SpacePostUpdate(body="hack"),
            )
            == "Only the author can edit this post"
        )
        assert _status_code(space_feed_service.delete_post, db_session, post_id=post_id, current_user=other) == 403

    def test_a_teacher_deletes_but_cannot_edit_a_student_post_with_no_notification(
        self, db_session: Session, owner: User
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        student = _student(db_session, classroom_id)
        post_id = _post(db_session, classroom_id, student)
        before = len(_notifications_of(db_session, student))

        assert (
            _detail(
                space_feed_service.update_post,
                db_session,
                post_id=post_id,
                current_user=owner,
                data=SpacePostUpdate(body="hack"),
            )
            == "Only the author can edit this post"
        )

        space_feed_service.delete_post(db_session, post_id=post_id, current_user=owner)
        assert len(_notifications_of(db_session, student)) == before

    def test_comment_moderation_mirrors_posts(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        student = _student(db_session, classroom_id)
        post_id = _post(db_session, classroom_id, owner)
        comment_id = _comment(db_session, post_id, student)
        other = _student(db_session, classroom_id)

        assert (
            _status_code(
                space_feed_service.update_comment,
                db_session,
                comment_id=comment_id,
                current_user=other,
                data=SpaceCommentUpdate(body="hack"),
            )
            == 403
        )
        space_feed_service.delete_comment(db_session, comment_id=comment_id, current_user=owner)


# ── Cursor pagination (the fixed off-by-one bug) ────────────────────────────────


class TestFeedPaging:
    def test_posts_page_boundary(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        p1 = _post(db_session, classroom_id, owner, "first")
        p2 = _post(db_session, classroom_id, owner, "second")
        p3 = _post(db_session, classroom_id, owner, "third")

        page1 = space_feed_service.list_posts(
            db_session, space_id=classroom_id, current_user=owner, cursor=None, limit=2
        )
        assert [p.id for p in page1.items] == [p3, p2]
        # The cursor is the last item ON the page, not the dropped lookahead row.
        assert page1.next_cursor == p2

        page2 = space_feed_service.list_posts(
            db_session, space_id=classroom_id, current_user=owner, cursor=page1.next_cursor, limit=2
        )
        assert [p.id for p in page2.items] == [p1]
        assert page2.next_cursor is None

    def test_comments_are_embedded_oldest_first(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        post_id = _post(db_session, classroom_id, owner)
        c1 = _comment(db_session, post_id, owner, "first")
        c2 = _comment(db_session, post_id, owner, "second")

        page = space_feed_service.list_posts(
            db_session, space_id=classroom_id, current_user=owner, cursor=None, limit=20
        )
        assert [c.id for c in page.items[0].comments] == [c1, c2]


# ── Notification events ──────────────────────────────────────────────────────


class TestNotificationEvents:
    def test_invite_received(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        invited = new_user(db_session)

        space_member_service.invite(db_session, space_id=classroom_id, current_user=owner, identifier=invited.username)

        rows = _notifications_of(db_session, invited)
        assert [r.type for r in rows] == [int(NotificationType.INVITE_RECEIVED)]
        page = notification_service.list_for_user(db_session, current_user=invited, unread_only=False, cursor=None)
        payload = page.items[0].payload
        assert payload.kind == "invite_received" and payload.space_id == classroom_id  # type: ignore[union-attr]

    def test_join_requested_notifies_owner_and_co_teachers_once(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        teacher = _teacher(db_session, classroom_id)
        requester = new_user(db_session)

        space_member_service.join(db_session, space_id=classroom_id, current_user=requester)

        for recipient in (owner, teacher):
            assert [n.type for n in _notifications_of(db_session, recipient)] == [int(NotificationType.JOIN_REQUESTED)]
        assert _notifications_of(db_session, requester) == []

    def test_join_requested_on_a_private_course_notifies_the_owner_only(self, db_session: Session, owner: User) -> None:
        """Only the owner of a standalone course can approve, so an editor gets no notice."""
        course = space_service.create_course(
            db_session, current_user=owner, data=SpaceCreate(title="Biology", visibility=SpaceVisibility.PRIVATE)
        )
        _publish_a_note(db_session, owner, course.id)
        space = db_session.get(Space, course.id)
        assert space is not None
        editor = new_user(db_session)
        add_member(db_session, space=space, user=editor, role=SpaceRole.EDITOR)
        requester = new_user(db_session)

        space_member_service.join(db_session, space_id=course.id, current_user=requester)

        assert [n.type for n in _notifications_of(db_session, owner)] == [int(NotificationType.JOIN_REQUESTED)]
        assert _notifications_of(db_session, editor) == []

    def test_a_pending_request_is_not_renotified(self, db_session: Session, owner: User) -> None:
        """Simulates the race `_add_viewer` guards: a concurrent call already made the REQUESTED row."""
        classroom_id = _classroom(db_session, owner)
        requester = new_user(db_session)
        classroom = db_session.get(Space, classroom_id)
        assert classroom is not None
        add_member(
            db_session, space=classroom, user=requester, role=SpaceRole.VIEWER, member_status=MemberStatus.REQUESTED
        )

        space_member_service.join(db_session, space_id=classroom_id, current_user=requester)

        assert _notifications_of(db_session, owner) == []

    def test_request_approved_via_approve_request(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        requester = new_user(db_session)
        space_member_service.join(db_session, space_id=classroom_id, current_user=requester)

        space_member_service.approve_request(
            db_session, space_id=classroom_id, user_id=requester.id, current_user=owner
        )

        assert [n.type for n in _notifications_of(db_session, requester)] == [int(NotificationType.REQUEST_APPROVED)]

    def test_a_second_approve_gets_409_and_sends_no_second_notification(self, db_session: Session, owner: User) -> None:
        """`approve_request` reads the row `FOR UPDATE`: the loser of a race sees ACTIVE and stops."""
        classroom_id = _classroom(db_session, owner)
        requester = new_user(db_session)
        space_member_service.join(db_session, space_id=classroom_id, current_user=requester)
        space_member_service.approve_request(
            db_session, space_id=classroom_id, user_id=requester.id, current_user=owner
        )

        status = _status_code(
            space_member_service.approve_request,
            db_session,
            space_id=classroom_id,
            user_id=requester.id,
            current_user=owner,
        )

        assert status == 409
        assert [n.type for n in _notifications_of(db_session, requester)] == [int(NotificationType.REQUEST_APPROVED)]

    def test_invite_on_an_already_approved_row_gets_409_and_sends_no_second_notification(
        self, db_session: Session, owner: User
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        requester = new_user(db_session)
        space_member_service.join(db_session, space_id=classroom_id, current_user=requester)
        space_member_service.approve_request(
            db_session, space_id=classroom_id, user_id=requester.id, current_user=owner
        )

        status = _status_code(
            space_member_service.invite,
            db_session,
            space_id=classroom_id,
            current_user=owner,
            identifier=requester.username,
        )

        assert status == 409
        assert [n.type for n in _notifications_of(db_session, requester)] == [int(NotificationType.REQUEST_APPROVED)]

    def test_request_approved_via_invite_on_a_requested_row(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        requester = new_user(db_session)
        space_member_service.join(db_session, space_id=classroom_id, current_user=requester)

        space_member_service.invite(
            db_session, space_id=classroom_id, current_user=owner, identifier=requester.username
        )

        assert [n.type for n in _notifications_of(db_session, requester)] == [int(NotificationType.REQUEST_APPROVED)]

    def test_content_published_notifies_active_students_only(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        teacher = _teacher(db_session, classroom_id)

        space_draft_service.publish(
            db_session,
            space_id=classroom_id,
            current_user=owner,
            data=SpacePublishRequest(notify_members=True, message="New stuff"),
        )

        assert [n.type for n in _notifications_of(db_session, student)] == [int(NotificationType.CONTENT_PUBLISHED)]
        assert _notifications_of(db_session, teacher) == []
        assert _notifications_of(db_session, owner) == []
        row = _notifications_of(db_session, student)[0]
        assert row.payload["classroom_id"] == classroom_id and row.payload["message"] == "New stuff"

    def test_a_classroom_course_notifies_students_only_once_it_is_visible(
        self, db_session: Session, owner: User
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        class_section = _section(db_session, owner, classroom_id)
        course = classroom_service.add_course(
            db_session,
            classroom_id=classroom_id,
            current_user=owner,
            data=ClassroomCourseCreate(title="Course", section_id=class_section),
        )
        notify = SpacePublishRequest(notify_members=True, message="Course news")
        course_section = _section(db_session, owner, course.id)
        space_draft_service.copy_item(
            db_session,
            space_id=course.id,
            current_user=owner,
            data=SpaceItemCopy(section_id=course_section, note_id=new_note(db_session, user=owner).id),
        )

        def publish_course() -> None:
            space_draft_service.publish(db_session, space_id=course.id, current_user=owner, data=notify)

        # The classroom has no published COURSE item yet: students can not open the course, so no notice.
        publish_course()
        assert _notifications_of(db_session, student) == []

        space_draft_service.publish(
            db_session, space_id=classroom_id, current_user=owner, data=SpacePublishRequest.model_validate({})
        )
        detail = space_draft_service.enter_edit_mode(db_session, space_id=course.id, current_user=owner)
        assert detail.draft_sections
        space_draft_service.rename_section(  # a structure change, so that publish has something to publish
            db_session,
            space_id=course.id,
            section_id=detail.draft_sections[0].id,
            current_user=owner,
            data=SpaceSectionUpdate(title="Renamed"),
        )
        publish_course()

        rows = _notifications_of(db_session, student)
        assert [n.type for n in rows] == [int(NotificationType.CONTENT_PUBLISHED)]
        assert rows[0].space_id == course.id
        assert rows[0].payload["classroom_id"] == classroom_id and rows[0].payload["message"] == "Course news"

    def test_a_standalone_course_notifies_its_active_viewers_only(self, db_session: Session, owner: User) -> None:
        course = space_service.create_course(db_session, current_user=owner, data=SpaceCreate(title="Biology"))
        space = db_session.get(Space, course.id)
        assert space is not None
        viewer, editor, pending = new_user(db_session), new_user(db_session), new_user(db_session)
        add_member(db_session, space=space, user=viewer, role=SpaceRole.VIEWER)
        add_member(db_session, space=space, user=editor, role=SpaceRole.EDITOR)
        add_member(db_session, space=space, user=pending, role=SpaceRole.VIEWER, member_status=MemberStatus.REQUESTED)

        space_draft_service.publish(
            db_session, space_id=course.id, current_user=owner, data=SpacePublishRequest(notify_members=True)
        )

        assert [n.type for n in _notifications_of(db_session, viewer)] == [int(NotificationType.CONTENT_PUBLISHED)]
        row = _notifications_of(db_session, viewer)[0]
        assert row.payload["classroom_id"] is None
        for other in (owner, editor, pending):
            assert _notifications_of(db_session, other) == []

    def test_publish_without_notify_members_sends_nothing(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        student = _student(db_session, classroom_id)

        space_draft_service.publish(
            db_session, space_id=classroom_id, current_user=owner, data=SpacePublishRequest.model_validate({})
        )

        assert _notifications_of(db_session, student) == []

    def test_post_created_notifies_active_members_and_owner_but_not_the_author(
        self, db_session: Session, owner: User
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        teacher = _teacher(db_session, classroom_id)
        student = _student(db_session, classroom_id)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)

        _post(db_session, classroom_id, teacher)

        assert [n.type for n in _notifications_of(db_session, owner)] == [int(NotificationType.POST_CREATED)]
        assert [n.type for n in _notifications_of(db_session, student)] == [int(NotificationType.POST_CREATED)]
        assert _notifications_of(db_session, teacher) == []

    def test_comment_created_notifies_the_post_author_only(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        post_id = _post(db_session, classroom_id, owner)

        _comment(db_session, post_id, student)

        assert [n.type for n in _notifications_of(db_session, owner)] == [int(NotificationType.COMMENT_CREATED)]
        # The student also got a POST_CREATED notification when `owner` made the post above (expected,
        # unrelated to this assertion) -- what matters here is that commenting never notifies yourself.
        assert int(NotificationType.COMMENT_CREATED) not in [n.type for n in _notifications_of(db_session, student)]

    def test_commenting_on_your_own_post_sends_no_notification(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        post_id = _post(db_session, classroom_id, owner)

        _comment(db_session, post_id, owner)

        assert _notifications_of(db_session, owner) == []

    def test_due_soon_notifies_once_across_two_bell_fetches_and_skips_teachers(
        self, db_session: Session, owner: User
    ) -> None:
        classroom = new_space(db_session, owner=owner, kind=SpaceKind.CLASSROOM)
        student = new_user(db_session)
        teacher = new_user(db_session)
        add_member(db_session, space=classroom, user=student, role=SpaceRole.VIEWER)
        add_member(db_session, space=classroom, user=teacher, role=SpaceRole.EDITOR)
        new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom),
            due_at=datetime.now(timezone.utc) + timedelta(hours=3),
        )

        notification_service.unread_count(db_session, current_user=student)
        notification_service.unread_count(db_session, current_user=student)

        student_notifs = _notifications_of(db_session, student)
        assert [n.type for n in student_notifs] == [int(NotificationType.DUE_SOON)]
        assert _notifications_of(db_session, teacher) == []

    def test_grade_overridden_notifies_the_student_not_the_actor(self, db_session: Session, owner: User) -> None:
        classroom_id, item_id = _loose_test_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        answer_id = _take_wrong(db_session, classroom_id, item_id, student)

        grade_override_service.set_override(db_session, answer_id=answer_id, score=1, current_user=owner)

        assert [n.type for n in _notifications_of(db_session, student)] == [int(NotificationType.GRADE_OVERRIDDEN)]
        assert _notifications_of(db_session, owner) == []


# ── Reads and purge ────────────────────────────────────────────────────────────


class TestNotificationReadsAndPurge:
    def test_mark_read_checks_ownership(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        invited = new_user(db_session)
        space_member_service.invite(db_session, space_id=classroom_id, current_user=owner, identifier=invited.username)
        notif = _notifications_of(db_session, invited)[0]
        stranger = new_user(db_session)

        assert (
            _status_code(notification_service.mark_read, db_session, notification_id=notif.id, current_user=stranger)
            == 404
        )

        notification_service.mark_read(db_session, notification_id=notif.id, current_user=invited)
        db_session.refresh(notif)
        assert notif.read_at is not None

    def test_mark_all_read_only_affects_the_caller(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        a, b = new_user(db_session), new_user(db_session)
        for user in (a, b):
            space_member_service.invite(db_session, space_id=classroom_id, current_user=owner, identifier=user.username)

        notification_service.mark_all_read(db_session, current_user=a)

        assert all(n.read_at is not None for n in _notifications_of(db_session, a))
        assert all(n.read_at is None for n in _notifications_of(db_session, b))

    def test_the_90_day_purge_keeps_unread_and_removes_old_read(self, db_session: Session, owner: User) -> None:
        student = new_user(db_session)
        old = datetime.now(timezone.utc) - timedelta(days=NOTIFICATION_RETENTION_DAYS + 1)
        read_old = Notification(
            user_id=student.id, type=int(NotificationType.POST_CREATED), payload={}, created_at=old, read_at=old
        )
        read_recent = Notification(
            user_id=student.id,
            type=int(NotificationType.POST_CREATED),
            payload={},
            read_at=datetime.now(timezone.utc),
        )
        unread_old = Notification(
            user_id=student.id, type=int(NotificationType.POST_CREATED), payload={}, created_at=old
        )
        db_session.add_all([read_old, read_recent, unread_old])
        db_session.flush()

        notification_service._purge_expired(db_session, user_id=student.id)

        remaining = {n.id for n in _notifications_of(db_session, student)}
        assert remaining == {read_recent.id, unread_old.id}


# ── Review + QA fix round ────────────────────────────────────────────────────


class TestOnlyActiveMembersAreNotified:
    def test_a_removed_post_author_gets_no_comment_notification(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        post_id = _post(db_session, classroom_id, student)
        space_member_service.remove_member(db_session, space_id=classroom_id, user_id=student.id, current_user=owner)

        _comment(db_session, post_id, owner)

        assert _notifications_of(db_session, student) == []

    def test_a_removed_student_gets_no_grade_override_notification(self, db_session: Session, owner: User) -> None:
        classroom_id, item_id = _loose_test_classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        answer_id = _take_wrong(db_session, classroom_id, item_id, student)
        space_member_service.remove_member(db_session, space_id=classroom_id, user_id=student.id, current_user=owner)

        grade_override_service.set_override(db_session, answer_id=answer_id, score=1, current_user=owner)

        assert _notifications_of(db_session, student) == []

    def test_an_active_post_author_still_gets_the_comment_notification(self, db_session: Session, owner: User) -> None:
        classroom_id = _classroom(db_session, owner)
        student = _student(db_session, classroom_id)
        _set_feed_permission(db_session, owner, classroom_id, FeedPermission.STUDENTS_POST_AND_COMMENT)
        post_id = _post(db_session, classroom_id, student)

        _comment(db_session, post_id, owner)

        assert [n.type for n in _notifications_of(db_session, student)] == [int(NotificationType.COMMENT_CREATED)]


class TestNewContentIsNotEdited:
    def test_a_new_post_and_comment_have_equal_created_and_updated_times(
        self, db_session: Session, owner: User
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        post_id = _post(db_session, classroom_id, owner)
        comment_id = _comment(db_session, post_id, owner)

        page = space_feed_service.list_posts(
            db_session, space_id=classroom_id, current_user=owner, cursor=None, limit=20
        )

        post = next(p for p in page.items if p.id == post_id)
        comment = next(c for c in post.comments if c.id == comment_id)
        assert post.created_at == post.updated_at
        assert comment.created_at == comment.updated_at


class TestInviteIsNotifiedOnce:
    def test_no_notification_when_a_parallel_call_made_the_row(
        self, db_session: Session, owner: User, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        classroom_id = _classroom(db_session, owner)
        invited = new_user(db_session)
        # A parallel invite won the race: `_add_viewer` reports "not created by this call".
        monkeypatch.setattr(space_member_service, "_add_viewer", lambda *args, **kwargs: False)

        space_member_service.invite(db_session, space_id=classroom_id, current_user=owner, identifier=invited.username)

        assert _notifications_of(db_session, invited) == []


class TestBellPollCost:
    def _due_classroom(self, db: Session, owner: User) -> User:
        classroom = new_space(db, owner=owner, kind=SpaceKind.CLASSROOM)
        student = new_user(db)
        add_member(db, space=classroom, user=student, role=SpaceRole.VIEWER)
        new_item(
            db,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db, user=owner, space=classroom),
            due_at=datetime.now(timezone.utc) + timedelta(hours=3),
        )
        return student

    def test_a_poll_with_nothing_new_inserts_nothing_and_does_not_commit(
        self, db_session: Session, owner: User, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        student = self._due_classroom(db_session, owner)
        notification_service.unread_count(db_session, current_user=student)
        inserts: list[int] = []
        commits: list[int] = []
        real_create_many = notification_crud.create_many
        monkeypatch.setattr(
            notification_crud,
            "create_many",
            lambda db, *, rows: (inserts.append(len(rows)), real_create_many(db, rows=rows)),
        )
        real_commit = db_session.commit
        monkeypatch.setattr(db_session, "commit", lambda: (commits.append(1), real_commit()))

        notification_service.unread_count(db_session, current_user=student)
        notification_service.list_for_user(db_session, current_user=student, unread_only=False, cursor=None)

        assert inserts == [] and commits == []
        assert len(_notifications_of(db_session, student)) == 1

    def test_only_the_missing_items_are_inserted(self, db_session: Session, owner: User) -> None:
        student = self._due_classroom(db_session, owner)
        notification_service.unread_count(db_session, current_user=student)
        classroom = db_session.scalars(select(Space).where(Space.owner_id == owner.id)).one()
        new_item(
            db_session,
            space=classroom,
            kind=SpaceItemKind.NOTE,
            note=new_note(db_session, user=owner, space=classroom),
            due_at=datetime.now(timezone.utc) + timedelta(hours=5),
        )

        notification_service.unread_count(db_session, current_user=student)

        keys = sorted(n.dedupe_key or "" for n in _notifications_of(db_session, student))
        assert len(keys) == 2 and len(set(keys)) == 2

    def test_the_purge_runs_on_the_list_fetch_only(self, db_session: Session, owner: User) -> None:
        user = new_user(db_session)
        old = datetime.now(timezone.utc) - timedelta(days=NOTIFICATION_RETENTION_DAYS + 1)
        db_session.add(
            Notification(
                user_id=user.id, type=int(NotificationType.POST_CREATED), payload={}, created_at=old, read_at=old
            )
        )
        db_session.flush()

        notification_service.unread_count(db_session, current_user=user)
        assert len(_notifications_of(db_session, user)) == 1

        notification_service.list_for_user(db_session, current_user=user, unread_only=False, cursor=None)
        assert _notifications_of(db_session, user) == []


class TestMalformedPayload:
    def test_a_row_with_a_bad_payload_is_skipped_with_a_warning(
        self, db_session: Session, owner: User, caplog: pytest.LogCaptureFixture
    ) -> None:
        user = new_user(db_session)
        bad = Notification(user_id=user.id, type=int(NotificationType.POST_CREATED), payload={"kind": "gone"})
        wrong_shape = Notification(
            user_id=user.id, type=int(NotificationType.POST_CREATED), payload={"kind": "post_created"}
        )
        good = Notification(
            user_id=user.id,
            type=int(NotificationType.INVITE_RECEIVED),
            payload={
                "kind": "invite_received",
                "space_id": "s",
                "space_title": "T",
                "space_kind": int(SpaceKind.CLASSROOM),
                "actor_name": "A",
            },
        )
        db_session.add_all([bad, wrong_shape, good])
        db_session.flush()

        with caplog.at_level(logging.WARNING, logger="smarttutor.notifications"):
            page = notification_service.list_for_user(db_session, current_user=user, unread_only=False, cursor=None)

        assert [item.id for item in page.items] == [good.id]
        assert bad.id in caplog.text and wrong_shape.id in caplog.text


# ── notification_crud ──────────────────────────────────────────────────────────


class TestNotificationCrud:
    def test_create_many_assigns_a_distinct_ulid_per_row(self, db_session: Session, owner: User) -> None:
        users = [new_user(db_session), new_user(db_session), new_user(db_session)]
        rows = [
            {
                "user_id": u.id,
                "type": int(NotificationType.POST_CREATED),
                "payload": {},
                "space_id": None,
                "actor_id": None,
                "dedupe_key": None,
            }
            for u in users
        ]

        notification_crud.create_many(db_session, rows=rows)

        ids = [n.id for u in users for n in _notifications_of(db_session, u)]
        assert len(ids) == 3 and len(set(ids)) == 3

    def test_on_conflict_do_nothing_dedupes_by_user_and_key(self, db_session: Session, owner: User) -> None:
        user = new_user(db_session)

        def row(dedupe_key: str | None) -> dict[str, object]:
            return {
                "user_id": user.id,
                "type": int(NotificationType.DUE_SOON),
                "payload": {},
                "space_id": None,
                "actor_id": None,
                "dedupe_key": dedupe_key,
            }

        notification_crud.create_many(db_session, rows=[row("due:item-1")])
        notification_crud.create_many(db_session, rows=[row("due:item-1")])
        notification_crud.create_many(db_session, rows=[row(None), row(None)])

        rows_in_db = _notifications_of(db_session, user)
        assert len([n for n in rows_in_db if n.dedupe_key == "due:item-1"]) == 1
        assert len([n for n in rows_in_db if n.dedupe_key is None]) == 2
