"""ST-67 Phase B: RAG over course notes, copy to library, Review scope and opt-in (real DB, rolled back)."""

from collections.abc import Callable
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus, MemberStatus, RevealAnswers, SpaceItemKind, SpaceRole, SpaceVisibility
from app.crud import note as note_crud
from app.crud import note_chunk as note_chunk_crud
from app.crud import question as question_crud
from app.crud.question import REVIEW_SCOPE_PERSONAL
from app.models.note import Note
from app.models.note_chunk import NoteChunk
from app.models.question import Question
from app.models.space_item import SpaceItem
from app.models.space_member import SpaceMember
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.space import (
    SpaceCreate,
    SpaceItemCopy,
    SpaceItemUpdate,
    SpacePublishRequest,
    SpaceSectionCreate,
)
from app.schemas.test import TestCreate
from app.services import (
    note_service,
    question_service,
    review_service,
    space_attempt_service,
    space_draft_service,
    space_member_service,
    space_service,
    test_result_service,
    test_service,
)
from app.services.assist_tools import execute_tool
from app.services.embedding_service import index_note
from tests.space_factories import add_member, new_note, new_space, new_test, new_user

pytestmark = pytest.mark.db

# Any non-zero vector: the cosine distance of a zero vector is undefined.
_EMBEDDING = [1.0] + [0.0] * 1535


def _status_code(service_call: Callable[..., object], db: Session, **kwargs: object) -> int:
    with pytest.raises(HTTPException) as exc_info:
        service_call(db, **kwargs)
    return exc_info.value.status_code


@pytest.fixture
def owner(db_session: Session) -> User:
    return new_user(db_session)


def _course(
    db: Session, owner: User, *, note_id: str | None = None, test_id: str | None = None, **policy: Any
) -> tuple[str, BackgroundTasks]:
    """A published PUBLIC course "Spanish" with one item (a note or a test). Returns (space id, background tasks)."""
    course = space_service.create_course(
        db, current_user=owner, data=SpaceCreate(title="Spanish", visibility=SpaceVisibility.PUBLIC)
    )
    course = space_draft_service.add_section(
        db, space_id=course.id, current_user=owner, data=SpaceSectionCreate(title="S")
    )
    assert course.draft_sections is not None
    item = space_draft_service.copy_item(
        db,
        space_id=course.id,
        current_user=owner,
        data=SpaceItemCopy(section_id=course.draft_sections[0].id, note_id=note_id, test_id=test_id),
    )
    if policy:
        draft_item = db.scalars(
            select(SpaceItem).where(SpaceItem.space_id == course.id, SpaceItem.is_draft.is_(True))
        ).one()
        space_draft_service.update_item(
            db,
            space_id=course.id,
            item_id=draft_item.id,
            current_user=owner,
            data=SpaceItemUpdate.model_validate(policy),
        )
    tasks = BackgroundTasks()
    space_draft_service.publish(
        db, space_id=course.id, current_user=owner, data=SpacePublishRequest(), background_tasks=tasks
    )
    assert item is not None
    return course.id, tasks


def _published_item(db: Session, space_id: str) -> SpaceItem:
    return db.scalars(select(SpaceItem).where(SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(False))).one()


def _course_with_note(db: Session, owner: User) -> tuple[str, str, BackgroundTasks]:
    """Returns (space id, published note id, publish background tasks)."""
    space_id, tasks = _course(db, owner, note_id=new_note(db, user=owner, content="mitochondria").id)
    note_id = _published_item(db, space_id).note_id
    assert note_id is not None
    return space_id, note_id, tasks


def _course_with_test(db: Session, owner: User, **policy: Any) -> tuple[str, Question]:
    """Returns (space id, the one published question)."""
    space_id, _ = _course(db, owner, test_id=new_test(db, user=owner).id, **policy)
    question = db.scalars(select(Question).join(Question.test).where(Question.test.has(space_id=space_id))).first()
    assert question is not None
    return space_id, question


def _draft_twin(db: Session, owner: User, space_id: str, note_id: str) -> Note:
    """Enter edit mode and make the note editable: returns the draft twin of the published note."""
    space_draft_service.enter_edit_mode(db, space_id=space_id, current_user=owner)
    draft_item = db.scalars(select(SpaceItem).where(SpaceItem.space_id == space_id, SpaceItem.is_draft.is_(True))).one()
    space_draft_service.make_editable(db, space_id=space_id, item_id=draft_item.id, current_user=owner)
    return db.scalars(select(Note).where(Note.draft_of_id == note_id)).one()


def _member(db: Session, space_id: str, *, include_in_srs: bool = False) -> User:
    user = new_user(db)
    space_member_service.join(db, space_id=space_id, current_user=user)
    if include_in_srs:
        space_member_service.set_membership(db, space_id=space_id, current_user=user, include_in_srs=True)
    return user


def _chunk(db: Session, note_id: str) -> None:
    db.add(NoteChunk(note_id=note_id, content="mitochondria", embedding=_EMBEDDING, chunk_index=0))
    db.flush()


def _searchable_ids(db: Session, user: User) -> set[str]:
    rows = note_chunk_crud.search_by_similarity(db, user_id=user.id, query_embedding=_EMBEDDING, limit=20)
    return {row.note_id for row in rows}


# ---------------------------------------------------------------------------
# C17, C18: RAG over course notes
# ---------------------------------------------------------------------------


class TestCourseNotesInSearch:
    def test_a_member_finds_the_published_note(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        member = _member(db_session, space_id)
        _chunk(db_session, note_id)
        assert note_id in _searchable_ids(db_session, member)
        assert note_chunk_crud.count_by_user(db_session, user_id=member.id) == 1
        assert note_id in note_crud.list_unindexed_ids_by_user(db_session, user_id=member.id)

    def test_a_draft_note_is_not_found(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        member = _member(db_session, space_id)
        twin = _draft_twin(db_session, owner, space_id, note_id)
        _chunk(db_session, twin.id)
        assert twin.id not in _searchable_ids(db_session, member)

    @pytest.mark.parametrize("member_status", [MemberStatus.INVITED, MemberStatus.REQUESTED])
    def test_a_member_that_is_not_active_finds_nothing(
        self, db_session: Session, owner: User, member_status: MemberStatus
    ) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        user = new_user(db_session)
        db_session.add(
            SpaceMember(space_id=space_id, user_id=user.id, role=int(SpaceRole.VIEWER), status=int(member_status))
        )
        db_session.flush()
        _chunk(db_session, note_id)
        assert note_id not in _searchable_ids(db_session, user)

    def test_a_member_that_left_finds_nothing(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        member = _member(db_session, space_id)
        _chunk(db_session, note_id)
        space_member_service.leave(db_session, space_id=space_id, current_user=member)
        assert note_id not in _searchable_ids(db_session, member)

    def test_a_stranger_finds_nothing(self, db_session: Session, owner: User) -> None:
        _, note_id, _ = _course_with_note(db_session, owner)
        _chunk(db_session, note_id)
        assert note_id not in _searchable_ids(db_session, new_user(db_session))


class TestPublishIndexing:
    def test_publish_schedules_the_new_note(self, db_session: Session, owner: User) -> None:
        _, note_id, tasks = _course_with_note(db_session, owner)
        assert [(t.func, t.args) for t in tasks.tasks] == [(note_service.schedule_indexing, (note_id,))]

    def test_publish_skips_an_unchanged_note(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        twin = _draft_twin(db_session, owner, space_id, note_id)
        twin.content = "changed"
        db_session.flush()
        tasks = BackgroundTasks()
        space_draft_service.publish(
            db_session, space_id=space_id, current_user=owner, data=SpacePublishRequest(), background_tasks=tasks
        )
        assert [t.args for t in tasks.tasks] == [(note_id,)]

    def test_index_note_skips_a_draft(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        twin = _draft_twin(db_session, owner, space_id, note_id)
        db_session.commit()
        with patch("app.services.embedding_service._generate_embeddings") as embed:
            index_note(db_session, note_id=twin.id)
        embed.assert_not_called()


class TestAssistantWritesNeedEdit:
    def test_a_viewer_can_not_refine_a_course_note(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        viewer = _member(db_session, space_id)
        db_session.commit()
        output = execute_tool(
            db_session,
            current_user=viewer,
            tool_name="refine_note",
            arguments={"note_id": note_id, "instruction": "shorter"},
        ).output
        assert "not found" in output.lower() or "access" in output.lower() or "permission" in output.lower()
        note = db_session.get(Note, note_id)
        assert note is not None and note.content == "mitochondria"


# ---------------------------------------------------------------------------
# C19, C20: tests from a course note, copy to library
# ---------------------------------------------------------------------------


class TestPersonalTestFromCourseNote:
    def test_a_viewer_makes_a_personal_test_linked_to_the_note(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        viewer = _member(db_session, space_id)
        test = test_service.create_test(
            db_session, current_user=viewer, data=TestCreate(title="From note", source_note_id=note_id)
        )
        assert test.user_id == viewer.id
        assert test.space_id is None
        assert test.source_note_id == note_id


class TestCopyToLibrary:
    def test_the_copy_is_personal_unlinked_and_in_the_root(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        viewer = _member(db_session, space_id)
        copy = note_service.copy_to_library(db_session, note_id=note_id, current_user=viewer)
        assert copy.id != note_id
        assert (copy.user_id, copy.space_id, copy.folder_id, copy.draft_of_id) == (viewer.id, None, None, None)
        assert copy.content == "mitochondria"
        assert copy.is_draft is False

    def test_a_stranger_can_not_copy(self, db_session: Session, owner: User) -> None:
        _, note_id, _ = _course_with_note(db_session, owner)
        status = _status_code(
            note_service.copy_to_library, db_session, note_id=note_id, current_user=new_user(db_session)
        )
        assert status in (403, 404)

    def test_the_copy_does_not_follow_the_course(self, db_session: Session, owner: User) -> None:
        space_id, note_id, _ = _course_with_note(db_session, owner)
        viewer = _member(db_session, space_id)
        copy = note_service.copy_to_library(db_session, note_id=note_id, current_user=viewer)
        space_member_service.leave(db_session, space_id=space_id, current_user=viewer)
        assert note_service.get_live_note(db_session, note_id=copy.id, current_user=viewer).id == copy.id


# ---------------------------------------------------------------------------
# C21, C22: Review scope and opt-in
# ---------------------------------------------------------------------------


class TestReviewScope:
    def test_opt_in_default_is_off(self, db_session: Session, owner: User) -> None:
        space_id, _ = _course_with_test(db_session, owner)
        member = _member(db_session, space_id)
        assert question_crud.user_has_questions(db_session, user_id=member.id) is False
        detail = space_service.get_course(db_session, space_id=space_id, current_user=member)
        assert detail.include_in_srs is False

    def test_opt_in_and_out(self, db_session: Session, owner: User) -> None:
        space_id, question = _course_with_test(db_session, owner)
        member = _member(db_session, space_id)
        on = space_member_service.set_membership(
            db_session, space_id=space_id, current_user=member, include_in_srs=True
        )
        assert on.include_in_srs is True
        questions, has = review_service.get_review_questions(db_session, current_user=member, limit=10, mode="practice")
        assert has and [q.id for q in questions] == [question.id]
        space_member_service.set_membership(db_session, space_id=space_id, current_user=member, include_in_srs=False)
        _, has = review_service.get_review_questions(db_session, current_user=member, limit=10, mode="practice")
        assert has is False

    def test_scope_filters_the_pool(self, db_session: Session, owner: User) -> None:
        space_id, question = _course_with_test(db_session, owner)
        member = _member(db_session, space_id, include_in_srs=True)
        personal = new_test(db_session, user=member).questions[0]

        def ids(scope: str) -> set[str]:
            rows, _ = review_service.get_review_questions(
                db_session, current_user=member, limit=10, mode="practice", scope=scope
            )
            return {q.id for q in rows}

        assert ids("all") == {question.id, personal.id}
        assert ids(REVIEW_SCOPE_PERSONAL) == {personal.id}
        assert ids(space_id) == {question.id}

    def test_a_scope_of_a_course_without_opt_in_is_empty(self, db_session: Session, owner: User) -> None:
        space_id, _ = _course_with_test(db_session, owner)
        member = _member(db_session, space_id)
        rows, has = review_service.get_review_questions(
            db_session, current_user=member, limit=10, mode="practice", scope=space_id
        )
        assert rows == [] and has is False

    def test_a_question_that_hides_its_answers_stays_out(self, db_session: Session, owner: User) -> None:
        space_id, _ = _course_with_test(db_session, owner, reveal_answers=RevealAnswers.NEVER)
        member = _member(db_session, space_id, include_in_srs=True)
        assert question_crud.user_has_questions(db_session, user_id=member.id) is False

    def test_the_owner_has_no_membership_to_change(self, db_session: Session, owner: User) -> None:
        space_id, _ = _course_with_test(db_session, owner)
        status = _status_code(
            space_member_service.set_membership,
            db_session,
            space_id=space_id,
            current_user=owner,
            include_in_srs=True,
        )
        assert status == 400

    def test_a_stranger_can_not_set_the_membership(self, db_session: Session, owner: User) -> None:
        space_id, _ = _course_with_test(db_session, owner)
        status = _status_code(
            space_member_service.set_membership,
            db_session,
            space_id=space_id,
            current_user=new_user(db_session),
            include_in_srs=True,
        )
        assert status == 403


class TestCheckQuestion:
    def test_an_opted_in_viewer_gets_srs_and_the_key_when_revealed(self, db_session: Session, owner: User) -> None:
        space_id, question = _course_with_test(db_session, owner, reveal_answers=RevealAnswers.ALWAYS)
        member = _member(db_session, space_id, include_in_srs=True)
        result = question_service.check_question(
            db_session, question_id=question.id, current_user=member, user_answer="ir"
        )
        assert result.status == AnswerStatus.CORRECT
        assert result.srs_state is not None
        assert result.correct_answers == ["ir"]

    def test_the_key_is_hidden_when_the_policy_hides_it(self, db_session: Session, owner: User) -> None:
        # AFTER_PASS_OR_LAST (default): a viewer with attempts left and no pass has no key yet.
        space_id, question = _course_with_test(db_session, owner)
        member = _member(db_session, space_id, include_in_srs=True)
        result = question_service.check_question(
            db_session, question_id=question.id, current_user=member, user_answer="wrong"
        )
        assert result.status == AnswerStatus.WRONG
        assert result.srs_state is not None
        assert result.correct_answers is None and result.correct_indices is None

    def test_a_viewer_that_did_not_opt_in_gets_403(self, db_session: Session, owner: User) -> None:
        space_id, question = _course_with_test(db_session, owner, reveal_answers=RevealAnswers.ALWAYS)
        member = _member(db_session, space_id)
        status = _status_code(
            question_service.check_question,
            db_session,
            question_id=question.id,
            current_user=member,
            user_answer="ir",
        )
        assert status == 403

    def test_a_stranger_gets_an_error(self, db_session: Session, owner: User) -> None:
        _, question = _course_with_test(db_session, owner, reveal_answers=RevealAnswers.ALWAYS)
        status = _status_code(
            question_service.check_question,
            db_session,
            question_id=question.id,
            current_user=new_user(db_session),
            user_answer="ir",
        )
        assert status in (403, 404)

    def test_the_author_checks_without_srs(self, db_session: Session, owner: User) -> None:
        _, question = _course_with_test(db_session, owner)
        result = question_service.check_question(
            db_session, question_id=question.id, current_user=owner, user_answer="ir"
        )
        assert result.status == AnswerStatus.CORRECT
        assert result.srs_state is None
        assert result.correct_answers == ["ir"]

    def test_a_personal_question_keeps_srs_and_the_key(self, db_session: Session) -> None:
        user = new_user(db_session)
        question = new_test(db_session, user=user).questions[0]
        result = question_service.check_question(
            db_session, question_id=question.id, current_user=user, user_answer="ir"
        )
        assert result.srs_state is not None and result.correct_answers == ["ir"]

    def test_an_editor_is_not_a_viewer(self, db_session: Session, owner: User) -> None:
        space = new_space(db_session, owner=owner)
        test = new_test(db_session, user=owner, space=space)
        editor = new_user(db_session)
        add_member(db_session, space=space, user=editor, role=SpaceRole.EDITOR)
        result = question_service.check_question(
            db_session, question_id=test.questions[0].id, current_user=editor, user_answer="ir"
        )
        assert result.correct_answers == ["ir"]


# ---------------------------------------------------------------------------
# C23: results list
# ---------------------------------------------------------------------------


class TestResultsListShowsTheCourse:
    def test_a_course_attempt_has_the_course_title(self, db_session: Session, owner: User) -> None:
        space_id, _ = _course_with_test(db_session, owner, reveal_answers=RevealAnswers.ALWAYS)
        member = _member(db_session, space_id)
        item = _published_item(db_session, space_id)
        assert item.kind == int(SpaceItemKind.TEST)
        start = space_attempt_service.start_attempt(db_session, space_id=space_id, item_id=item.id, current_user=member)
        assert start.attempt_id is not None
        space_attempt_service.submit_attempt(
            db_session,
            space_id=space_id,
            attempt_id=start.attempt_id,
            current_user=member,
            submission=TestSubmission.model_validate(
                {"answers": [{"question_id": q.id, "user_answer": "ir"} for q in start.test.questions]}
            ),
            background_tasks=BackgroundTasks(),
        )
        items, total = test_result_service.list_results(db_session, current_user=member)
        assert total == 1
        assert items[0].space_title == "Spanish"
