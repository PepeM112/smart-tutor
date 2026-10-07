"""Personal queries ignore space content (ST-66 acceptance criterion C6).

The same user owns one personal row and one space row of each kind. Each personal query must
return the personal row only. Run with `pytest --run-db tests/test_personal_scope_db.py` (`make test-db`).
"""

import pytest
from sqlalchemy.orm import Session

from app.crud import note as note_crud
from app.crud import note_chunk as note_chunk_crud
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.models.note import Note
from app.models.note_chunk import NoteChunk
from app.models.user import User
from tests.space_factories import new_note, new_space, new_test, new_user

pytestmark = pytest.mark.db

# Any non-zero vector: the cosine distance of a zero vector is undefined.
_EMBEDDING = [1.0] + [0.0] * 1535


@pytest.fixture
def user(db_session: Session) -> User:
    return new_user(db_session)


@pytest.fixture
def notes(db_session: Session, user: User) -> tuple[Note, Note]:
    """(personal, space) notes of the same user, with the same content and one chunk each."""
    course = new_space(db_session, owner=user)
    personal = new_note(db_session, user=user, content="mitochondria")
    space = new_note(db_session, user=user, space=course, content="mitochondria")
    db_session.add_all(
        [
            NoteChunk(note_id=n.id, content="mitochondria", embedding=_EMBEDDING, chunk_index=0)
            for n in (personal, space)
        ]
    )
    db_session.flush()
    return personal, space


class TestNoteQueries:
    def test_list_live_by_ids(self, db_session: Session, user: User, notes: tuple[Note, Note]) -> None:
        rows = note_crud.list_live_by_ids(db_session, user_id=user.id, ids=[n.id for n in notes])
        assert [n.id for n in rows] == [notes[0].id]

    def test_list_tree_notes(self, db_session: Session, user: User, notes: tuple[Note, Note]) -> None:
        assert [row.id for row in note_crud.list_tree_notes(db_session, user_id=user.id)] == [notes[0].id]

    def test_search_live_content(self, db_session: Session, user: User, notes: tuple[Note, Note]) -> None:
        rows = note_crud.search_live_content(db_session, user_id=user.id, query="mito", folder_ids=None, limit=10)
        assert [row[0] for row in rows] == [notes[0].id]

    def test_list_by_user(self, db_session: Session, user: User, notes: tuple[Note, Note]) -> None:
        rows, total = note_crud.list_by_user(db_session, user_id=user.id)
        assert [n.id for n in rows] == [notes[0].id]
        assert total == 1

    def test_list_unindexed_ids_by_user(self, db_session: Session, user: User, notes: tuple[Note, Note]) -> None:
        assert note_crud.list_unindexed_ids_by_user(db_session, user_id=user.id) == [notes[0].id]


class TestNoteChunkQueries:
    def test_count_by_user(self, db_session: Session, user: User, notes: tuple[Note, Note]) -> None:
        assert note_chunk_crud.count_by_user(db_session, user_id=user.id) == 1

    def test_search_by_similarity(self, db_session: Session, user: User, notes: tuple[Note, Note]) -> None:
        rows = note_chunk_crud.search_by_similarity(db_session, user_id=user.id, query_embedding=_EMBEDDING)
        assert [row.note_id for row in rows] == [notes[0].id]


class TestTestAndQuestionQueries:
    @pytest.fixture
    def personal_test_id(self, db_session: Session, user: User) -> str:
        new_test(db_session, user=user, space=new_space(db_session, owner=user))
        return new_test(db_session, user=user).id

    def test_test_list_by_user(self, db_session: Session, user: User, personal_test_id: str) -> None:
        rows, total = test_crud.list_by_user(db_session, user_id=user.id)
        assert [t.id for t in rows] == [personal_test_id]
        assert total == 1

    def test_question_list_by_user(self, db_session: Session, user: User, personal_test_id: str) -> None:
        rows, total = question_crud.list_by_user(db_session, user_id=user.id)
        assert [q.test_id for q in rows] == [personal_test_id]
        assert total == 1

    def test_reviewable_questions(self, db_session: Session, user: User, personal_test_id: str) -> None:
        rows = question_crud.list_new_for_review(db_session, user_id=user.id, limit=10)
        assert [q.test_id for q in rows] == [personal_test_id]

    def test_space_questions_alone_are_not_reviewable(self, db_session: Session) -> None:
        other = new_user(db_session)
        new_test(db_session, user=other, space=new_space(db_session, owner=other))
        assert question_crud.user_has_questions(db_session, user_id=other.id) is False
