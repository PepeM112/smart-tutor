"""Tests for the history conversion of the assistant (provider message formats).

Both providers reject a tool call that has no result right after it, so the converters
must give a valid order, and repair the order of an old or broken history.

Run:  pytest tests/test_assist_messages.py
"""

from __future__ import annotations

import logging
from typing import Any

import pytest

from app.schemas.assist import AssistMessage, ToolCallData, ToolConfirmation, ToolResultData
from app.services.assist_service import _to_anthropic_messages, _to_openai_messages


def _call(id: str, name: str) -> ToolCallData:
    return ToolCallData(id=id, name=name, arguments={})


def _assistant(text: str, *calls: ToolCallData) -> AssistMessage:
    return AssistMessage(role="assistant", content=text, tool_calls=list(calls) or None)


def _tool(**outputs: str) -> AssistMessage:
    return AssistMessage(
        role="tool", content="", tool_results=[ToolResultData(tool_call_id=k, output=v) for k, v in outputs.items()]
    )


USER = AssistMessage(role="user", content="Move my notes to a new folder")

# What the frontend stored before the fix: the result of `cf` came after the newer assistant message.
BROKEN_HISTORY = [
    USER,
    _assistant("", _call("cf", "create_folder")),
    _assistant("Moving.", _call("mv", "move_items")),
    _tool(cf="Created folder"),
]
# The same conversation, in the order the frontend stores it now.
FIXED_HISTORY = [
    USER,
    _assistant("", _call("cf", "create_folder")),
    _tool(cf="Created folder"),
    _assistant("Moving.", _call("mv", "move_items")),
]


def _anthropic_ids(out: list[dict[str, Any]]) -> list[tuple[str, list[str]]]:
    """(role, tool ids) per message: tool_use ids for assistant, tool_result ids for user."""
    rows: list[tuple[str, list[str]]] = []
    for m in out:
        blocks = m["content"] if isinstance(m["content"], list) else []
        ids = [b.get("id") or b.get("tool_use_id") for b in blocks if b.get("type") in ("tool_use", "tool_result")]
        rows.append((m["role"], ids))
    return rows


class TestAnthropicConversion:
    def test_valid_history_keeps_the_result_right_after_the_call(self) -> None:
        out = _to_anthropic_messages(FIXED_HISTORY, [ToolConfirmation(tool_call_id="mv", approved=False)])
        assert _anthropic_ids(out) == [
            ("user", []),
            ("assistant", ["cf"]),
            ("user", ["cf"]),
            ("assistant", ["mv"]),
            ("user", ["mv"]),  # the decline of the pending call is added at the end
        ]

    def test_late_result_is_moved_right_after_its_call(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="smarttutor.assist"):
            out = _to_anthropic_messages(BROKEN_HISTORY)
        assert _anthropic_ids(out) == [
            ("user", []),
            ("assistant", ["cf"]),
            ("user", ["cf"]),
            ("assistant", ["mv"]),
        ]
        assert "Repaired the order of tool results" in caplog.text

    def test_valid_history_does_not_log_a_repair(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="smarttutor.assist"):
            _to_anthropic_messages(FIXED_HISTORY)
        assert caplog.text == ""

    def test_all_results_of_one_assistant_message_stay_together(self) -> None:
        history = [
            USER,
            _assistant("Looking.", _call("a", "list_notes"), _call("b", "list_folders")),
            _tool(a="notes", b="folders"),
            _assistant("Done."),
        ]
        out = _to_anthropic_messages(history)
        assert _anthropic_ids(out)[1:3] == [("assistant", ["a", "b"]), ("user", ["a", "b"])]

    def test_pending_call_without_result_is_left_alone(self) -> None:
        out = _to_anthropic_messages([USER, _assistant("", _call("p", "edit_test"))])
        assert _anthropic_ids(out) == [("user", []), ("assistant", ["p"])]

    def test_result_without_a_call_is_dropped(self) -> None:
        out = _to_anthropic_messages([USER, _tool(ghost="x"), AssistMessage(role="user", content="Hi")])
        assert [m["role"] for m in out] == ["user", "user"]
        assert all(isinstance(m["content"], str) for m in out)


class TestOpenAIConversion:
    @staticmethod
    def _rows(out: list[dict[str, Any]]) -> list[tuple[str, list[str]]]:
        return [
            (
                m["role"],
                [tc["id"] for tc in m.get("tool_calls", [])] + ([m["tool_call_id"]] if m["role"] == "tool" else []),
            )
            for m in out
        ]

    def test_valid_history(self) -> None:
        out = _to_openai_messages(FIXED_HISTORY, [ToolConfirmation(tool_call_id="mv", approved=False)])
        assert self._rows(out) == [
            ("user", []),
            ("assistant", ["cf"]),
            ("tool", ["cf"]),
            ("assistant", ["mv"]),
            ("tool", ["mv"]),
        ]

    def test_late_result_is_moved_right_after_its_call(self) -> None:
        out = _to_openai_messages(BROKEN_HISTORY)
        assert self._rows(out) == [
            ("user", []),
            ("assistant", ["cf"]),
            ("tool", ["cf"]),
            ("assistant", ["mv"]),
        ]

    def test_one_assistant_message_with_several_calls_is_followed_by_all_results(self) -> None:
        history = [
            USER,
            _assistant("Looking.", _call("a", "list_notes"), _call("b", "list_folders")),
            _tool(a="notes", b="folders"),
        ]
        assert self._rows(_to_openai_messages(history))[1:] == [
            ("assistant", ["a", "b"]),
            ("tool", ["a"]),
            ("tool", ["b"]),
        ]
