"""Tests for the confirm flow of the assistant loop (`stream_assist` with `tool_confirmations`).

The client sends the user's decisions. The loop must run an approved call only once, only when it
really waits for a decision, and give every pending call a result (both providers reject a call
without one). It must also send one `done` event and save the token usage, also after an error.

Run:  pytest tests/test_assist_confirmations.py
"""

from __future__ import annotations

import copy
import json
import logging
from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.core.enums import AIProvider
from app.models.user import User
from app.schemas.assist import AssistMessage, AssistRequest, ToolCallData, ToolConfirmation, ToolResultData
from app.services.assist_service import DECLINED_OUTPUT, NOT_CONFIRMED_OUTPUT, stream_assist
from app.services.llm import StreamResult, TextDelta, ToolCallDelta

ASSIST = "app.services.assist_service"

USER_MSG = AssistMessage(role="user", content="Make two notes")


def _user(provider: AIProvider | None = None) -> User:
    return User(id="u1", username="u", email="u@example.com", hashed_password="x", ai_provider=provider)


def _assistant(*ids: str) -> AssistMessage:
    calls = [ToolCallData(id=i, name="create_note", arguments={"topic": i}) for i in ids]
    return AssistMessage(role="assistant", content="", tool_calls=calls)


def _tool(**outputs: str) -> AssistMessage:
    return AssistMessage(
        role="tool", content="", tool_results=[ToolResultData(tool_call_id=k, output=v) for k, v in outputs.items()]
    )


def _end(tokens: int = 10) -> StreamResult:
    return StreamResult(stop_reason="end_turn", text="done", input_tokens=tokens, output_tokens=tokens)


class _FakeLLM:
    """Plays one scripted round per call and keeps a copy of the messages of each call."""

    def __init__(self, *rounds: StreamResult | Exception) -> None:
        self._rounds = iter(rounds)
        self.calls: list[list[dict[str, Any]]] = []

    def stream_with_tools(
        self, *, messages: list[dict[str, Any]], **_: object
    ) -> Generator[TextDelta, None, StreamResult]:
        self.calls.append(copy.deepcopy(messages))
        result = next(self._rounds)
        if isinstance(result, Exception):
            raise result
        yield TextDelta("ok")
        return result


def _run(
    llm: _FakeLLM,
    messages: list[AssistMessage],
    confirmations: list[ToolConfirmation] | None = None,
    user: User | None = None,
) -> tuple[list[tuple[str, dict[str, Any]]], MagicMock, MagicMock]:
    request = AssistRequest(messages=messages, tool_confirmations=confirmations)
    with (
        patch(f"{ASSIST}.get_user_llm_client", return_value=llm),
        patch(f"{ASSIST}.build_confirm_context", return_value=None),
        patch(f"{ASSIST}.execute_tool") as execute,
        patch(f"{ASSIST}.token_usage_service") as usage_service,
    ):
        execute.return_value = MagicMock(output="Note created", metadata=None)
        chunks = list(stream_assist(MagicMock(), current_user=user or _user(), request=request))
    events = [
        (chunk.split("\n")[0].removeprefix("event: "), json.loads(chunk.split("\n")[1].removeprefix("data: ")))
        for chunk in chunks
    ]
    return events, execute, usage_service


def _names(events: list[tuple[str, dict[str, Any]]]) -> list[str]:
    return [name for name, _ in events]


def _last_tool_results(messages: list[dict[str, Any]]) -> list[tuple[str, str, bool]]:
    """(id, output, is_error) of the tool results in the last Anthropic message."""
    return [(b["tool_use_id"], b["content"], b.get("is_error", False)) for b in messages[-1]["content"]]


class TestApprovedCall:
    def test_runs_once_and_the_result_goes_back_to_the_model(self) -> None:
        llm = _FakeLLM(_end())
        events, execute, _ = _run(llm, [USER_MSG, _assistant("a")], [ToolConfirmation(tool_call_id="a", approved=True)])
        execute.assert_called_once()
        assert _names(events)[:2] == ["tool_executing", "tool_result"]
        assert _last_tool_results(llm.calls[0]) == [("a", "Note created", False)]

    def test_openai_gets_one_tool_message_per_result(self) -> None:
        llm = _FakeLLM(_end())
        confirmations = [
            ToolConfirmation(tool_call_id="a", approved=True),
            ToolConfirmation(tool_call_id="b", approved=False),
        ]
        _run(llm, [USER_MSG, _assistant("a", "b")], confirmations, user=_user(AIProvider.OPENAI))
        assert llm.calls[0][-2:] == [
            {"role": "tool", "tool_call_id": "a", "content": "Note created"},
            {"role": "tool", "tool_call_id": "b", "content": DECLINED_OUTPUT},
        ]


class TestReplayedConfirmation:
    def test_a_call_that_already_has_a_result_does_not_run_again(self, caplog: pytest.LogCaptureFixture) -> None:
        history = [USER_MSG, _assistant("a"), _tool(a="Note created")]
        with caplog.at_level(logging.WARNING, logger="smarttutor.assist"):
            events, execute, _ = _run(_FakeLLM(_end()), history, [ToolConfirmation(tool_call_id="a", approved=True)])
        execute.assert_not_called()
        assert "tool_result" not in _names(events)
        assert "not pending" in caplog.text

    def test_a_call_of_an_older_turn_does_not_run(self) -> None:
        # The user wrote a new message after the card: the old call is no longer waiting.
        history = [USER_MSG, _assistant("a"), _tool(a="User changed their request."), USER_MSG]
        _, execute, _ = _run(_FakeLLM(_end()), history, [ToolConfirmation(tool_call_id="a", approved=True)])
        execute.assert_not_called()

    def test_a_confirmation_sent_before_the_assistant_message_is_stored_does_nothing(self) -> None:
        _, execute, _ = _run(_FakeLLM(_end()), [USER_MSG], [ToolConfirmation(tool_call_id="a", approved=True)])
        execute.assert_not_called()


class TestPartialConfirmation:
    def test_every_pending_call_gets_a_result_in_call_order(self) -> None:
        llm = _FakeLLM(_end())
        # Only "b" is confirmed; "a" and "c" got no decision.
        _run(llm, [USER_MSG, _assistant("a", "b", "c")], [ToolConfirmation(tool_call_id="b", approved=True)])
        assert _last_tool_results(llm.calls[0]) == [
            ("a", NOT_CONFIRMED_OUTPUT, True),
            ("b", "Note created", False),
            ("c", NOT_CONFIRMED_OUTPUT, True),
        ]

    def test_a_call_with_a_result_from_this_round_is_not_pending(self) -> None:
        # A read tool of the same round ran at once; only the write call waits.
        llm = _FakeLLM(_end())
        history = [USER_MSG, _assistant("read", "write"), _tool(read="notes")]
        _, execute, _ = _run(llm, history, [ToolConfirmation(tool_call_id="write", approved=True)])
        execute.assert_called_once()
        assert [r[0] for r in _last_tool_results(llm.calls[0])] == ["write"]


class TestDoneAndUsage:
    def test_one_done_event_with_the_usage_of_all_rounds(self) -> None:
        read_round = StreamResult(
            stop_reason="tool_use",
            text="",
            tool_calls=[ToolCallDelta(id="r", name="list_notes", arguments={})],
            input_tokens=5,
            output_tokens=5,
        )
        events, _, usage_service = _run(_FakeLLM(read_round, _end(10)), [USER_MSG])
        assert _names(events).count("done") == 1
        assert events[-1] == ("done", {"usage": {"input_tokens": 15, "output_tokens": 15}})
        usage_service.record_usage.assert_called_once()

    def test_pause_sends_the_pending_ids_in_done(self) -> None:
        write_round = StreamResult(
            stop_reason="tool_use", text="", tool_calls=[ToolCallDelta(id="w", name="create_note", arguments={})]
        )
        events, _, _ = _run(_FakeLLM(write_round), [USER_MSG])
        assert _names(events)[-2:] == ["confirm_required", "done"]
        assert events[-1][1]["pending_confirmations"] == ["w"]

    def test_an_error_after_a_round_keeps_its_usage(self) -> None:
        read_round = StreamResult(
            stop_reason="tool_use",
            text="",
            tool_calls=[ToolCallDelta(id="r", name="list_notes", arguments={})],
            input_tokens=7,
            output_tokens=3,
        )
        events, _, usage_service = _run(_FakeLLM(read_round, RuntimeError("boom")), [USER_MSG])
        assert _names(events)[-2:] == ["error", "done"]
        assert events[-1][1]["usage"] == {"input_tokens": 7, "output_tokens": 3}
        result = usage_service.record_usage.call_args.kwargs["result"]
        assert (result.input_tokens, result.output_tokens) == (7, 3)

    def test_a_failed_usage_save_still_ends_the_stream(self) -> None:
        llm = _FakeLLM(_end())
        request = AssistRequest(messages=[USER_MSG])
        with (
            patch(f"{ASSIST}.get_user_llm_client", return_value=llm),
            patch(f"{ASSIST}.token_usage_service") as usage_service,
        ):
            usage_service.record_usage.side_effect = RuntimeError("db down")
            chunks = list(stream_assist(MagicMock(), current_user=_user(), request=request))
        assert chunks[-1].startswith("event: done")
