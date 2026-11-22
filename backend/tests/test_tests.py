"""Tests for test_service: the source note of a new test must be a live note of the user.

Run:  pytest tests/test_tests.py
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import test_service


def _note(user_id: str = "u1", deleted_at: datetime | None = None) -> MagicMock:
    n = MagicMock()
    n.id = "n1"
    n.user_id = user_id
    n.deleted_at = deleted_at
    n.space_id = None  # personal
    n.is_draft = False
    return n


@pytest.fixture
def mock_note_crud() -> Iterator[MagicMock]:
    with patch("app.services.access_service.note_crud") as mock:
        yield mock


@pytest.fixture
def mock_test_crud() -> Iterator[MagicMock]:
    with patch("app.services.test_service.test_crud") as mock:
        yield mock


def _create_test(source_note_id: str | None) -> None:
    # Imported here: at module level, pytest tries to collect `TestCreate` as a test class.
    from app.schemas.test import TestCreate

    user = MagicMock()
    user.id = "u1"
    test_service.create_test(MagicMock(), current_user=user, data=TestCreate(title="T", source_note_id=source_note_id))


class TestCreateTestSourceNote:
    def test_live_owned_note_is_accepted(self, mock_note_crud: MagicMock, mock_test_crud: MagicMock) -> None:
        mock_note_crud.get_by_id.return_value = _note()
        _create_test("n1")
        assert mock_test_crud.create.call_args.kwargs["source_note_id"] == "n1"

    def test_no_source_note_skips_the_check(self, mock_note_crud: MagicMock, mock_test_crud: MagicMock) -> None:
        _create_test(None)
        mock_note_crud.get_by_id.assert_not_called()
        mock_test_crud.create.assert_called_once()

    @pytest.mark.parametrize(
        ("note", "status_code"),
        [
            (None, 404),  # missing
            (_note(deleted_at=datetime.now(timezone.utc)), 404),  # in Trash
            (_note(user_id="other"), 403),  # another user's note (same rule as access_service)
        ],
    )
    def test_invalid_source_note_is_rejected_before_create(
        self, mock_note_crud: MagicMock, mock_test_crud: MagicMock, note: MagicMock | None, status_code: int
    ) -> None:
        mock_note_crud.get_by_id.return_value = note
        with pytest.raises(HTTPException) as exc_info:
            _create_test("n1")

        assert exc_info.value.status_code == status_code
        mock_test_crud.create.assert_not_called()


class TestUpdateTestKeepsOrigin:
    """The editor saves a test by sending all its questions again, so `origin_id` must go with them."""

    def _save(self, data: object, known_ids: set[str] | None = None) -> MagicMock:
        db = MagicMock()
        stored_test = MagicMock(questions=[], question_groups=[])
        with (
            patch("app.services.test_service.get_test", return_value=stored_test),
            patch("app.services.test_service.version_test_if_needed"),
            patch("app.services.test_service.test_crud"),
            patch("app.services.test_service.question_crud.existing_ids", return_value=known_ids or set()),
        ):
            test_service.update_test(db, test_id="t1", current_user=MagicMock(id="u1"), data=data)  # type: ignore[arg-type]
        return db

    @staticmethod
    def _created_questions(db: MagicMock) -> list[MagicMock]:
        return [q for call in db.add_all.call_args_list for q in call.args[0]]

    def test_standalone_question_keeps_origin_id(self) -> None:
        from app.schemas.question import QuestionCreate
        from app.schemas.test import TestUpdate

        data = TestUpdate(
            questions=[
                QuestionCreate.model_validate(
                    {
                        "questionType": 1,
                        "prompt": "to go",
                        "content": {"answers": ["ir"]},
                        "originId": "source-1",
                    }
                )
            ]
        )

        questions = self._created_questions(self._save(data, known_ids={"source-1"}))

        assert [q.origin_id for q in questions] == ["source-1"]

    def test_grouped_question_keeps_origin_id(self) -> None:
        from app.schemas.test import TestUpdate

        data = TestUpdate.model_validate(
            {
                "questionGroups": [
                    {
                        "type": 1,
                        "order": 0,
                        "title": "G",
                        "questions": [
                            {
                                "questionType": 1,
                                "prompt": "to go",
                                "content": {"answers": ["ir"]},
                                "originId": "source-2",
                            }
                        ],
                    }
                ]
            }
        )

        questions = self._created_questions(self._save(data, known_ids={"source-2"}))

        assert [q.origin_id for q in questions] == ["source-2"]

    def test_unknown_origin_id_is_saved_as_none_and_known_id_is_kept(self) -> None:
        from app.schemas.test import TestUpdate

        data = TestUpdate.model_validate(
            {
                "questions": [
                    {"questionType": 1, "prompt": "a", "order": 0, "content": {"answers": ["x"]}, "originId": "known"},
                    {"questionType": 1, "prompt": "b", "order": 1, "content": {"answers": ["x"]}, "originId": "gone"},
                ],
                "questionGroups": [
                    {
                        "type": 1,
                        "order": 5,
                        "questions": [
                            {"questionType": 1, "prompt": "c", "content": {"answers": ["x"]}, "originId": "gone"}
                        ],
                    }
                ],
            }
        )

        questions = self._created_questions(self._save(data, known_ids={"known"}))

        assert {q.prompt: q.origin_id for q in questions} == {"a": "known", "b": None, "c": None}
