"""AI assistant service — agentic streaming loop with tool use.

Orchestrates the conversation loop:
1. Build system prompt with page context
2. Convert frontend messages to provider format
3. Stream LLM response, yielding SSE events
4. On tool calls: auto-execute tools, pause the ones the user must approve (`needs_confirmation`).
   The next request carries the user's decisions (`tool_confirmations`) and resumes the loop
5. Feed tool results back and continue streaming
"""

from __future__ import annotations

import json
import logging
from collections.abc import Generator
from dataclasses import dataclass
from typing import Any, NamedTuple

from sqlalchemy.orm import Session

from app.core.enums import AIFeature, AIProvider
from app.models.user import User
from app.schemas.assist import AssistMessage, AssistRequest, ToolCallData, ToolConfirmation, ToolResultData
from app.services import token_usage_service
from app.services.ai_permission_service import needs_confirmation
from app.services.assist_prompts import build_system_prompt
from app.services.assist_tools import (
    build_confirm_context,
    execute_tool,
    get_tool_definitions_anthropic,
    get_tool_definitions_openai,
)
from app.services.llm import (
    CompletionResult,
    StreamEvent,
    StreamResult,
    TextDelta,
    ToolCallDelta,
    classify_provider_error,
    get_user_llm_client,
)

logger = logging.getLogger("smarttutor.assist")

MAX_TOKENS = 4096
MAX_TOOL_ROUNDS = 6

DECLINED_OUTPUT = "User declined this action."
NOT_CONFIRMED_OUTPUT = "The user did not confirm this action, so it did not run."


# ---------------------------------------------------------------------------
# SSE event types emitted to the frontend
# ---------------------------------------------------------------------------


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Message format conversion
# ---------------------------------------------------------------------------


def _repair_tool_result_order(messages: list[AssistMessage]) -> list[AssistMessage]:
    """Put every tool result in the tool message right after the assistant message that holds its tool call.

    Both providers reject a history where a tool call has no result immediately after it. The
    frontend builds the history, and an old client could store a result late (after a newer
    assistant message). This repair makes the order valid again and logs a warning when it moves
    something. A result stored before its call is moved too. A result with no matching tool call
    is dropped, and so is a second result for the same call, because both providers reject them.
    Tool calls that have no result yet are left alone: they can be pending confirmations, which
    the converters add at the end.
    """
    owner_by_call_id: dict[str, int] = {
        tc.id: index for index, msg in enumerate(messages) if msg.role == "assistant" for tc in msg.tool_calls or []
    }
    results_by_owner: dict[int, list[ToolResultData]] = {}
    seen_call_ids: set[str] = set()
    repaired = False

    for index, msg in enumerate(messages):
        if msg.role != "tool":
            continue
        # The assistant message right before this run of tool messages.
        run_start = index
        while run_start > 0 and messages[run_start - 1].role == "tool":
            run_start -= 1
        previous_assistant = run_start - 1
        for result in msg.tool_results or []:
            owner = owner_by_call_id.get(result.tool_call_id)
            if owner is None:
                logger.warning("Dropping tool result without a tool call: %s", result.tool_call_id)
                repaired = True
                continue
            if result.tool_call_id in seen_call_ids:
                logger.warning("Dropping duplicate tool result: %s", result.tool_call_id)
                repaired = True
                continue
            seen_call_ids.add(result.tool_call_id)
            repaired = repaired or owner != previous_assistant
            results_by_owner.setdefault(owner, []).append(result)

    if not repaired:
        return messages

    logger.warning("Repaired the order of tool results in the conversation history")
    out: list[AssistMessage] = []
    for index, msg in enumerate(messages):
        if msg.role == "tool":
            continue
        out.append(msg)
        if index in results_by_owner:
            out.append(AssistMessage(role="tool", content="", tool_results=results_by_owner[index]))
    return out


class _ToolOutcome(NamedTuple):
    """The result of one tool call, as the provider gets it back."""

    tool_call_id: str
    output: str
    is_error: bool = False


def _tool_result_messages(outcomes: list[_ToolOutcome], *, is_anthropic: bool) -> list[dict[str, Any]]:
    """Provider messages that give back tool results: one user message (Anthropic), one tool message each (OpenAI)."""
    if not outcomes:
        return []
    if is_anthropic:
        blocks = [
            {"type": "tool_result", "tool_use_id": o.tool_call_id, "content": o.output}
            | ({"is_error": True} if o.is_error else {})
            for o in outcomes
        ]
        return [{"role": "user", "content": blocks}]
    return [{"role": "tool", "tool_call_id": o.tool_call_id, "content": o.output} for o in outcomes]


def _history_outcomes(results: list[ToolResultData]) -> list[_ToolOutcome]:
    return [_ToolOutcome(tr.tool_call_id, str(tr.output)) for tr in results]


def _to_anthropic_messages(messages: list[AssistMessage]) -> list[dict[str, Any]]:
    """Convert our schema messages to Anthropic's message format."""
    out: list[dict[str, Any]] = []

    for msg in _repair_tool_result_order(messages):
        if msg.role == "user":
            out.append({"role": "user", "content": msg.content})

        elif msg.role == "assistant":
            content: list[dict[str, Any]] = []
            if msg.content:
                content.append({"type": "text", "text": msg.content})
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    content.append(
                        {
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.name,
                            "input": tc.arguments,
                        }
                    )
            out.append({"role": "assistant", "content": content or msg.content})

        elif msg.role == "tool" and msg.tool_results:
            out.extend(_tool_result_messages(_history_outcomes(msg.tool_results), is_anthropic=True))

    return out


def _to_openai_messages(messages: list[AssistMessage]) -> list[dict[str, Any]]:
    """Convert our schema messages to OpenAI's message format."""
    out: list[dict[str, Any]] = []

    for msg in _repair_tool_result_order(messages):
        if msg.role == "user":
            out.append({"role": "user", "content": msg.content})

        elif msg.role == "assistant":
            entry: dict[str, Any] = {"role": "assistant", "content": msg.content or None}
            if msg.tool_calls:
                entry["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                    }
                    for tc in msg.tool_calls
                ]
            out.append(entry)

        elif msg.role == "tool" and msg.tool_results:
            out.extend(_tool_result_messages(_history_outcomes(msg.tool_results), is_anthropic=False))

    return out


# ---------------------------------------------------------------------------
# Confirmations
# ---------------------------------------------------------------------------


def _pending_tool_calls(messages: list[AssistMessage]) -> list[ToolCallData]:
    """The tool calls of the last assistant message that have no result yet.

    Only when nothing but tool results comes after that message: a newer user message means the
    conversation went on, so nothing waits for a decision. `messages` must be repaired first
    (`_repair_tool_result_order`), so the results of a call come right after its message.
    """
    tail_start = len(messages)
    while tail_start > 0 and messages[tail_start - 1].role == "tool":
        tail_start -= 1
    if tail_start == 0 or messages[tail_start - 1].role != "assistant":
        return []
    answered = {tr.tool_call_id for msg in messages[tail_start:] for tr in msg.tool_results or []}
    return [tc for tc in messages[tail_start - 1].tool_calls or [] if tc.id not in answered]


def _resolve_pending_calls(
    db: Session,
    *,
    current_user: User,
    messages: list[AssistMessage],
    confirmations: list[ToolConfirmation],
) -> Generator[str, None, list[_ToolOutcome]]:
    """Run the approved pending calls and give a result to every pending call, in call order.

    The decisions come from the client, so they are not trusted as they are:
    - A decision for a call that is not pending (a replayed or duplicated request, or a call that
      already has a result) is ignored. Without this, a retry runs a write tool a second time.
    - A pending call with no decision gets a "not confirmed" result. Both providers reject a tool
      call that has no result right after it.
    """
    if not confirmations:
        return []

    pending = _pending_tool_calls(messages)
    decisions = {c.tool_call_id: c.approved for c in confirmations}
    ignored = decisions.keys() - {tc.id for tc in pending}
    if ignored:
        logger.warning("Ignoring confirmations for tool calls that are not pending: %s", sorted(ignored))

    outcomes: list[_ToolOutcome] = []
    for tc in pending:
        approved = decisions.get(tc.id)
        if approved:
            yield _sse("tool_executing", {"id": tc.id, "name": tc.name})
            outcomes.append((yield from _run_tool(db, current_user=current_user, call=tc)))
        elif approved is False:
            outcomes.append(_ToolOutcome(tc.id, DECLINED_OUTPUT, is_error=True))
        else:
            outcomes.append(_ToolOutcome(tc.id, NOT_CONFIRMED_OUTPUT, is_error=True))
    return outcomes


# ---------------------------------------------------------------------------
# Main streaming loop
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _UsageTotals:
    """Token usage of all the rounds of one request. It lives outside the loop, so an error does not lose it."""

    input_tokens: int = 0
    output_tokens: int = 0
    provider: str = ""
    model: str = ""

    def add(self, result: StreamResult) -> None:
        self.input_tokens += result.input_tokens
        self.output_tokens += result.output_tokens
        self.provider = result.provider
        self.model = result.model

    def as_event(self) -> dict[str, int]:
        return {"input_tokens": self.input_tokens, "output_tokens": self.output_tokens}


def stream_assist(
    db: Session,
    *,
    current_user: User,
    request: AssistRequest,
) -> Generator[str, None, None]:
    """Run the agentic loop and yield SSE-formatted strings.

    Every stream ends with exactly one `done` event, sent here, after the token usage is saved.
    """
    usage = _UsageTotals()
    done_extra: dict[str, Any] = {}
    try:
        done_extra = yield from _stream_assist_inner(db, current_user=current_user, request=request, usage=usage)
    except Exception as exc:
        # Drop the uncommitted state of the failed step, so the usage row below can still be saved.
        db.rollback()
        classified = classify_provider_error(exc)
        if classified:
            logger.warning("Provider error in stream_assist: %s", classified.detail)
            yield _sse("error", {"message": str(classified.detail)})
        else:
            logger.exception("Unhandled error in stream_assist")
            yield _sse("error", {"message": "An unexpected error occurred."})

    _record_usage(db, current_user=current_user, usage=usage)
    yield _sse("done", {"usage": usage.as_event(), **done_extra})


def _stream_assist_inner(
    db: Session,
    *,
    current_user: User,
    request: AssistRequest,
    usage: _UsageTotals,
) -> Generator[str, None, dict[str, Any]]:
    """The loop itself. Returns the extra fields of the `done` event (the calls that wait for the user)."""
    system_prompt = build_system_prompt(request.page_context)

    llm = get_user_llm_client(current_user)
    is_anthropic = current_user.ai_provider is None or current_user.ai_provider == AIProvider.ANTHROPIC

    history = _repair_tool_result_order(request.messages)
    if is_anthropic:
        provider_messages = _to_anthropic_messages(history)
        tool_defs = get_tool_definitions_anthropic()
    else:
        provider_messages = _to_openai_messages(history)
        tool_defs = get_tool_definitions_openai()

    confirmed = yield from _resolve_pending_calls(
        db, current_user=current_user, messages=history, confirmations=request.tool_confirmations or []
    )
    provider_messages.extend(_tool_result_messages(confirmed, is_anthropic=is_anthropic))

    provider_name = "anthropic" if is_anthropic else "openai"
    logger.info("Starting assist loop: provider=%s, messages=%d", provider_name, len(provider_messages))

    for _round in range(MAX_TOOL_ROUNDS):
        logger.info("Round %d: sending %d messages to LLM", _round, len(provider_messages))
        stream = llm.stream_with_tools(
            system=system_prompt,
            messages=provider_messages,
            tools=tool_defs or None,
            max_tokens=MAX_TOKENS,
        )
        stream_result = yield from _relay_text(stream)
        usage.add(stream_result)

        logger.info(
            "Round %d: stop_reason=%s, tool_calls=%d, text_len=%d",
            _round,
            stream_result.stop_reason,
            len(stream_result.tool_calls),
            len(stream_result.text),
        )

        if not stream_result.tool_calls:
            # No tool calls — the LLM is done
            return {}

        # Process tool calls
        confirm_calls: list[ToolCallDelta] = []
        auto_outcomes: list[_ToolOutcome] = []

        for tc in stream_result.tool_calls:
            logger.info("Tool call: %s (id=%s, args=%s)", tc.name, tc.id, tc.arguments)
            yield _sse("tool_call", {"id": tc.id, "name": tc.name, "arguments": tc.arguments})

            if needs_confirmation(current_user, tc.name):
                confirm_calls.append(tc)
            else:
                logger.info("Auto-executing tool: %s", tc.name)
                outcome = yield from _run_tool(db, current_user=current_user, call=tc)
                logger.info("Tool %s result: %s", tc.name, outcome.output[:200])
                auto_outcomes.append(outcome)

        if confirm_calls:
            # Pause: emit confirm_required for each write tool, then stop
            for wc in confirm_calls:
                event_data: dict[str, Any] = {"id": wc.id, "name": wc.name, "arguments": wc.arguments}
                context = build_confirm_context(db, wc.name, wc.arguments, current_user)
                if context:
                    event_data["context"] = context
                yield _sse("confirm_required", event_data)
            return {"pending_confirmations": [wc.id for wc in confirm_calls]}

        # Feed auto-executed tool results back into the conversation
        if is_anthropic:
            assistant_content: list[dict[str, Any]] = []
            if stream_result.text:
                assistant_content.append({"type": "text", "text": stream_result.text})
            for tc in stream_result.tool_calls:
                assistant_content.append(
                    {
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments,
                    }
                )
            provider_messages.append({"role": "assistant", "content": assistant_content})
        else:
            entry: dict[str, Any] = {"role": "assistant", "content": stream_result.text or None}
            entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                }
                for tc in stream_result.tool_calls
            ]
            provider_messages.append(entry)
        provider_messages.extend(_tool_result_messages(auto_outcomes, is_anthropic=is_anthropic))

    yield _sse("error", {"message": "Too many tool rounds. Please try a simpler request."})
    return {}


def _relay_text(stream: Generator[StreamEvent, None, StreamResult]) -> Generator[str, None, StreamResult]:
    """Forward the text deltas of one round as SSE events, and return the round's `StreamResult`."""
    while True:
        try:
            event = next(stream)
        except StopIteration as stop:
            return stop.value
        if isinstance(event, TextDelta):
            yield _sse("text_delta", {"content": event.text})


def _run_tool(
    db: Session, *, current_user: User, call: ToolCallData | ToolCallDelta
) -> Generator[str, None, _ToolOutcome]:
    """Execute one tool call and send its `tool_result` event."""
    result = execute_tool(db, current_user=current_user, tool_name=call.name, arguments=call.arguments)
    event: dict[str, Any] = {"id": call.id, "name": call.name, "output": result.output}
    if result.metadata:
        event["metadata"] = result.metadata.model_dump(by_alias=True, mode="json")
    yield _sse("tool_result", event)
    return _ToolOutcome(call.id, result.output)


def _record_usage(db: Session, *, current_user: User, usage: _UsageTotals) -> None:
    if usage.input_tokens == 0 and usage.output_tokens == 0:
        return
    try:
        token_usage_service.record_usage(
            db,
            user_id=current_user.id,
            result=CompletionResult(
                text="",
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                provider=usage.provider,
                model=usage.model,
            ),
            feature=AIFeature.ASSIST,
        )
        # Nothing else commits the request session after the stream, so the usage row would be lost.
        db.commit()
    except Exception:
        # A broad catch on purpose: the reply has already streamed, and the client still needs `done`.
        # A lost usage row is better than a stream that never ends.
        logger.exception("Could not save the token usage of the assistant")
        db.rollback()
