"""AI assistant service — agentic streaming loop with tool use.

Orchestrates the conversation loop:
1. Build system prompt with page context
2. Convert frontend messages to provider format
3. Stream LLM response, yielding SSE events
4. On tool calls: auto-execute reads, pause for write confirmation
5. Feed tool results back and continue streaming
"""

from __future__ import annotations

import json
import logging
from collections.abc import Generator
from typing import Any

from sqlalchemy.orm import Session

from app.core.enums import AIFeature, AIProvider
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.models.user import User
from app.schemas.assist import AssistMessage, AssistRequest, ToolConfirmation
from app.services import token_usage_service
from app.services.assist_prompts import build_system_prompt
from app.services.assist_tools import (
    WRITE_TOOLS,
    execute_tool,
    get_tool_definitions_anthropic,
    get_tool_definitions_openai,
)
from app.services.llm import (
    CompletionResult,
    StreamResult,
    TextDelta,
    ToolCallDelta,
    get_user_llm_client,
)

logger = logging.getLogger("smarttutor.assist")

MAX_TOKENS = 4096
MAX_TOOL_ROUNDS = 6


# ---------------------------------------------------------------------------
# SSE event types emitted to the frontend
# ---------------------------------------------------------------------------


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Message format conversion
# ---------------------------------------------------------------------------


def _to_anthropic_messages(
    messages: list[AssistMessage],
    pending_confirmations: list[ToolConfirmation] | None = None,
) -> list[dict[str, Any]]:
    """Convert our schema messages to Anthropic's message format."""
    out: list[dict[str, Any]] = []

    for msg in messages:
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
            tool_content: list[dict[str, Any]] = []
            for tr in msg.tool_results:
                tool_content.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tr.tool_call_id,
                        "content": str(tr.output),
                    }
                )
            out.append({"role": "user", "content": tool_content})

    if pending_confirmations:
        rejection_content: list[dict[str, Any]] = []
        for conf in pending_confirmations:
            if not conf.approved:
                rejection_content.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": conf.tool_call_id,
                        "content": "User declined this action.",
                        "is_error": True,
                    }
                )
        if rejection_content:
            out.append({"role": "user", "content": rejection_content})

    return out


def _to_openai_messages(
    messages: list[AssistMessage],
    pending_confirmations: list[ToolConfirmation] | None = None,
) -> list[dict[str, Any]]:
    """Convert our schema messages to OpenAI's message format."""
    out: list[dict[str, Any]] = []

    for msg in messages:
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
            for tr in msg.tool_results:
                out.append(
                    {
                        "role": "tool",
                        "tool_call_id": tr.tool_call_id,
                        "content": str(tr.output),
                    }
                )

    if pending_confirmations:
        for conf in pending_confirmations:
            if not conf.approved:
                out.append(
                    {
                        "role": "tool",
                        "tool_call_id": conf.tool_call_id,
                        "content": "User declined this action.",
                    }
                )

    return out


# ---------------------------------------------------------------------------
# Main streaming loop
# ---------------------------------------------------------------------------


def stream_assist(
    db: Session,
    *,
    current_user: User,
    request: AssistRequest,
) -> Generator[str, None, None]:
    """Run the agentic loop and yield SSE-formatted strings."""
    try:
        yield from _stream_assist_inner(db, current_user=current_user, request=request)
    except Exception as exc:
        from app.services.llm import _classify_provider_error

        classified = _classify_provider_error(exc)
        if classified:
            logger.warning("Provider error in stream_assist: %s", classified.detail)
            yield _sse("error", {"message": str(classified.detail)})
        else:
            logger.exception("Unhandled error in stream_assist")
            yield _sse("error", {"message": "An unexpected error occurred."})
        yield _sse("done", {"usage": {"input_tokens": 0, "output_tokens": 0}})


def _stream_assist_inner(
    db: Session,
    *,
    current_user: User,
    request: AssistRequest,
) -> Generator[str, None, None]:
    system_prompt = build_system_prompt(request.page_context)

    llm = get_user_llm_client(current_user)
    is_anthropic = current_user.ai_provider is None or current_user.ai_provider == AIProvider.ANTHROPIC

    if is_anthropic:
        provider_messages = _to_anthropic_messages(
            request.messages,
            request.tool_confirmations,
        )
        tool_defs = get_tool_definitions_anthropic()
    else:
        provider_messages = _to_openai_messages(
            request.messages,
            request.tool_confirmations,
        )
        tool_defs = get_tool_definitions_openai()

    # Handle approved write-tool confirmations: execute the tool now
    if request.tool_confirmations:
        for conf in request.tool_confirmations:
            if conf.approved:
                # Find the tool call in the last assistant message
                tc_data = _find_tool_call(request.messages, conf.tool_call_id)
                if tc_data:
                    yield _sse("tool_executing", {"id": conf.tool_call_id, "name": tc_data["name"]})
                    result = execute_tool(
                        db,
                        current_user=current_user,
                        tool_name=tc_data["name"],
                        arguments=tc_data["arguments"],
                    )
                    tr_event: dict[str, Any] = {
                        "id": conf.tool_call_id,
                        "name": tc_data["name"],
                        "output": result.output,
                    }
                    if result.metadata:
                        tr_event["metadata"] = result.metadata
                    yield _sse("tool_result", tr_event)
                    # Feed the result back into the conversation
                    if is_anthropic:
                        provider_messages.append(
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": conf.tool_call_id,
                                        "content": result.output,
                                    }
                                ],
                            }
                        )
                    else:
                        provider_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": conf.tool_call_id,
                                "content": result.output,
                            }
                        )

    total_input = 0
    total_output = 0
    stream_result: StreamResult | None = None

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

        # Exhaust the generator to collect the StreamResult
        stream_result = None
        try:
            while True:
                event = next(stream)
                if isinstance(event, TextDelta):
                    yield _sse("text_delta", {"content": event.text})
        except StopIteration as stop:
            stream_result = stop.value

        if stream_result is None:
            yield _sse("error", {"message": "Stream ended unexpectedly."})
            return

        total_input += stream_result.input_tokens
        total_output += stream_result.output_tokens

        logger.info(
            "Round %d: stop_reason=%s, tool_calls=%d, text_len=%d",
            _round,
            stream_result.stop_reason,
            len(stream_result.tool_calls),
            len(stream_result.text),
        )

        if not stream_result.tool_calls:
            # No tool calls — the LLM is done
            _record_usage(
                db, current_user=current_user, total_input=total_input, total_output=total_output, result=stream_result
            )
            yield _sse("done", {"usage": {"input_tokens": total_input, "output_tokens": total_output}})
            return

        # Process tool calls
        write_calls: list[ToolCallDelta] = []
        read_results: list[dict[str, Any]] = []

        for tc in stream_result.tool_calls:
            logger.info("Tool call: %s (id=%s, args=%s)", tc.name, tc.id, tc.arguments)
            yield _sse("tool_call", {"id": tc.id, "name": tc.name, "arguments": tc.arguments})

            if tc.name in WRITE_TOOLS:
                write_calls.append(tc)
            else:
                logger.info("Auto-executing read tool: %s", tc.name)
                result = execute_tool(
                    db,
                    current_user=current_user,
                    tool_name=tc.name,
                    arguments=tc.arguments,
                )
                logger.info("Read tool %s result: %s", tc.name, result.output[:200])
                yield _sse("tool_result", {"id": tc.id, "name": tc.name, "output": result.output})
                read_results.append({"id": tc.id, "output": result.output})

        if write_calls:
            # Pause: emit confirm_required for each write tool, then stop
            for wc in write_calls:
                event_data: dict[str, Any] = {"id": wc.id, "name": wc.name, "arguments": wc.arguments}
                context = _build_confirm_context(db, wc.name, wc.arguments, current_user)
                if context:
                    event_data["context"] = context
                yield _sse("confirm_required", event_data)
            _record_usage(
                db, current_user=current_user, total_input=total_input, total_output=total_output, result=stream_result
            )
            yield _sse(
                "done",
                {
                    "usage": {"input_tokens": total_input, "output_tokens": total_output},
                    "pending_confirmations": [wc.id for wc in write_calls],
                },
            )
            return

        # Feed read tool results back into the conversation
        assistant_content: list[dict[str, Any]] = []
        if stream_result.text:
            assistant_content.append({"type": "text", "text": stream_result.text})

        if is_anthropic:
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
            tool_result_content = [
                {"type": "tool_result", "tool_use_id": r["id"], "content": r["output"]} for r in read_results
            ]
            provider_messages.append({"role": "user", "content": tool_result_content})
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
            for r in read_results:
                provider_messages.append({"role": "tool", "tool_call_id": r["id"], "content": r["output"]})

    # Exceeded MAX_TOOL_ROUNDS
    if stream_result is not None:
        _record_usage(
            db, current_user=current_user, total_input=total_input, total_output=total_output, result=stream_result
        )
    yield _sse("error", {"message": "Too many tool rounds. Please try a simpler request."})
    yield _sse("done", {"usage": {"input_tokens": total_input, "output_tokens": total_output}})


def _build_confirm_context(
    db: Session, tool_name: str, arguments: dict[str, Any], current_user: User
) -> dict[str, Any] | None:
    """Resolve tool arguments into human-readable context for the confirm card."""
    if tool_name == "edit_test":
        context: dict[str, Any] = {}
        test_id = arguments.get("test_id")
        if test_id:
            test = test_crud.get_by_id(db, id=str(test_id))
            if test and test.user_id == current_user.id:
                new_title = arguments.get("title")
                if new_title:
                    context["title_change"] = {"from": test.title, "to": str(new_title)}
                new_desc = arguments.get("description")
                if new_desc:
                    context["description_change"] = {
                        "from": test.description or "",
                        "to": str(new_desc),
                    }
        remove_ids = arguments.get("remove_question_ids")
        if isinstance(remove_ids, list) and remove_ids:
            questions = question_crud.list_by_ids(db, ids=[str(qid) for qid in remove_ids])
            context["questions_to_remove"] = [
                {"id": q.id, "prompt": q.prompt} for q in questions if q.user_id == current_user.id
            ]
        return context if context else None
    return None


def _find_tool_call(messages: list[AssistMessage], tool_call_id: str) -> dict[str, Any] | None:
    for msg in reversed(messages):
        if msg.tool_calls:
            for tc in msg.tool_calls:
                if tc.id == tool_call_id:
                    return {"name": tc.name, "arguments": tc.arguments}
    return None


def _record_usage(
    db: Session,
    *,
    current_user: User,
    total_input: int,
    total_output: int,
    result: StreamResult,
) -> None:
    if total_input == 0 and total_output == 0:
        return
    token_usage_service.record_usage(
        db,
        user_id=current_user.id,
        result=CompletionResult(
            text="",
            input_tokens=total_input,
            output_tokens=total_output,
            provider=result.provider,
            model=result.model,
        ),
        feature=AIFeature.ASSIST,
    )
