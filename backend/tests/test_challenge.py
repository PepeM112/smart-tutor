"""Tests for the order of the calls in `challenge_service.process_challenge` (no DB, no network).

Run:  pytest tests/test_challenge.py
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.core.enums import LongTextLength, QuestionType
from app.schemas.question import LongTextContent, RubricItem
from app.services import challenge_service
from app.services.llm import CompletionResult
from tests.llm_fakes import resolve_to


def _ordered(**mocks: MagicMock) -> MagicMock:
    """Attach the mocks to one parent, so `parent.mock_calls` shows the call order across them."""
    parent = MagicMock()
    for name, mock in mocks.items():
        parent.attach_mock(mock, name)
    return parent


def _call_names(parent: MagicMock) -> list[str]:
    # Direct calls only ("db.commit"), not calls on their return values.
    return [name for name, _args, _kwargs in parent.mock_calls if "()" not in name]


def _run_challenge(*, met: bool) -> list[str]:
    content = LongTextContent(length_limit=LongTextLength.SHORT, rubric=[RubricItem(point="Names it", weight=1.0)])
    answer = SimpleNamespace(
        id="a1",
        question_id="q1",
        test_result_id="r1",
        user_answer="my answer",
        rubric_result=[
            {
                "point": "Names it",
                "met": False,
                "reason": "no",
                "weight": 1.0,
                "challenge_result": {"argument": "I did", "met": None, "reason": ""},
            }
        ],
    )
    question = SimpleNamespace(
        id="q1", question_type=int(QuestionType.LONG_TEXT), prompt="Q?", content=content.model_dump()
    )
    test_result = SimpleNamespace(id="r1", user_id="u1", space_item_id=None)

    db = MagicMock()
    client = MagicMock()
    client.complete.return_value = CompletionResult(
        text=json.dumps({"results": [{"index": 0, "met": met, "reason": "ok"}]}),
        input_tokens=1,
        output_tokens=1,
        provider="anthropic",
        model="test-model",
    )

    with (
        patch.object(challenge_service, "SessionLocal", return_value=db),
        patch.object(challenge_service, "answer_crud") as mock_answer_crud,
        patch.object(challenge_service.question_crud, "get_by_id", return_value=question),
        patch.object(challenge_service.user_crud, "get_by_id", return_value=SimpleNamespace(id="u1", ai_provider=None)),
        patch.object(challenge_service, "resolve_llm", side_effect=resolve_to(client)),
        patch.object(challenge_service, "test_result_crud") as mock_test_result_crud,
        patch.object(challenge_service, "recalculate_test_result") as mock_recalculate,
        patch.object(challenge_service, "space_progress_service") as mock_progress,
        patch.object(challenge_service, "_recalculate_answer_status"),
        patch("app.services.token_usage_service.record_usage"),
    ):
        mock_answer_crud.get_by_id.return_value = answer
        mock_answer_crud.get_test_result_with_answers.return_value = test_result
        order = _ordered(
            llm=client.complete,
            test_result_crud=mock_test_result_crud,
            answer_crud=mock_answer_crud,
            recalculate=mock_recalculate,
            progress=mock_progress,
            db=db,
        )
        challenge_service.process_challenge("a1")

    return _call_names(order)


class TestProcessChallengeLock:
    def test_a_flipped_criterion_locks_the_result_before_it_reads_and_recalculates(self) -> None:
        """The lock comes after the slow AI call. Then the service saves, reads all again and recalculates."""
        names = _run_challenge(met=True)

        assert names == [
            "answer_crud.get_by_id",
            "answer_crud.get_test_result_with_answers",
            "llm",
            "test_result_crud.lock",
            "db.flush",
            "db.expire_all",
            "answer_crud.get_test_result_with_answers",
            "recalculate",
            "progress.recheck_result_completion",
            "db.commit",
            "db.close",
        ]

    def test_an_upheld_grade_does_not_lock_or_recalculate(self) -> None:
        names = _run_challenge(met=False)

        assert "test_result_crud.lock" not in names
        assert "recalculate" not in names
