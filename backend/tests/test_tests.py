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
    return n


@pytest.fixture
def mock_note_crud() -> Iterator[MagicMock]:
    with patch("app.services.test_service.note_crud") as mock:
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
            (_note(user_id="other"), 403),  # another user's note (same rule as get_owned_or_404)
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
