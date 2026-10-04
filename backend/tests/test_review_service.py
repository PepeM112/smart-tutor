"""Tests for the review limit of `review_service.get_review_questions`.

Run:  pytest tests/test_review_service.py
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services import review_service

CRUD = "app.services.review_service.question_crud"


def _due(count: int) -> list[MagicMock]:
    return [MagicMock() for _ in range(count)]


class TestDailyReviewLimit:
    def test_limit_of_the_user_caps_the_request(self) -> None:
        user = MagicMock(daily_review_limit=5)
        with patch(CRUD) as crud:
            crud.user_has_questions.return_value = True
            crud.list_due_for_review.return_value = _due(5)
            questions, has_questions = review_service.get_review_questions(MagicMock(), current_user=user, limit=20)
        assert has_questions
        assert len(questions) == 5
        assert crud.list_due_for_review.call_args.kwargs["limit"] == 5
        # The cap is used up by the due questions, so no new question is added.
        crud.list_new_for_review.assert_not_called()

    def test_request_limit_is_used_when_the_user_has_no_limit(self) -> None:
        user = MagicMock(daily_review_limit=None)
        with patch(CRUD) as crud:
            crud.user_has_questions.return_value = True
            crud.list_due_for_review.return_value = _due(2)
            crud.list_new_for_review.return_value = _due(3)
            questions, _ = review_service.get_review_questions(MagicMock(), current_user=user, limit=20)
        assert crud.list_due_for_review.call_args.kwargs["limit"] == 20
        assert crud.list_new_for_review.call_args.kwargs["limit"] == 18
        assert len(questions) == 5
