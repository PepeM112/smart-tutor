"""Shared low-level LLM client — call any provider, get text back.

Both the grading module and note generation use the same underlying LLM
providers.  This module centralises client initialisation and text extraction
so that each feature only needs to supply a system prompt, user prompt, and
max_tokens.
"""

from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from collections.abc import Generator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from app.core.enums import AIProvider

if TYPE_CHECKING:
    from app.models.user import User

logger = logging.getLogger("smarttutor.llm")


@dataclass(frozen=True, slots=True)
class CompletionResult:
    text: str
    input_tokens: int
    output_tokens: int
    provider: str
    model: str


# ---------------------------------------------------------------------------
# Streaming + tool-use types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TextDelta:
    """A chunk of streamed assistant text."""

    text: str


@dataclass(frozen=True, slots=True)
class ToolCallDelta:
    """Emitted once a tool call is fully assembled from the stream."""

    id: str
    name: str
    arguments: dict[str, object]


@dataclass(slots=True)
class StreamResult:
    """Final summary returned after the stream is exhausted."""

    stop_reason: str
    text: str
    tool_calls: list[ToolCallDelta] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    provider: str = ""
    model: str = ""


StreamEvent = TextDelta | ToolCallDelta


class LLMClient(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def complete(self, *, system: str, user_prompt: str, max_tokens: int) -> CompletionResult:
        """Send a system + user message pair and return the text response with usage data."""
        ...

    @abstractmethod
    def stream_with_tools(
        self,
        *,
        system: str,
        messages: list[dict[str, object]],
        tools: list[dict[str, object]] | None = None,
        max_tokens: int,
    ) -> Generator[StreamEvent, None, StreamResult]:
        """Stream a multi-turn conversation with optional tool definitions.

        Yields ``TextDelta`` and ``ToolCallDelta`` events as they arrive.
        The generator's return value (accessible via ``StopIteration.value``)
        is a ``StreamResult`` with aggregated usage and the full stop reason.
        """
        ...


class AnthropicLLMClient(LLMClient):
    MODEL = "claude-haiku-4-5-20251001"

    def __init__(self, api_key: str | None = None) -> None:
        from anthropic import Anthropic

        resolved_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        if not resolved_key:
            raise ValueError("ANTHROPIC_API_KEY is not set")
        self._client = Anthropic(api_key=resolved_key)

    @property
    def name(self) -> str:
        return f"Anthropic ({self.MODEL})"

    def complete(self, *, system: str, user_prompt: str, max_tokens: int) -> CompletionResult:
        from anthropic.types import TextBlock

        response = self._client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )

        if not response.content:
            raise ValueError(
                f"Empty response from Anthropic (stop_reason={response.stop_reason}, usage={response.usage})"
            )

        block = response.content[0]
        if not isinstance(block, TextBlock):
            raise TypeError(f"Expected TextBlock, got {type(block).__name__}")

        text = block.text.strip()
        if not text:
            raise ValueError(
                f"Anthropic returned empty text (stop_reason={response.stop_reason}, usage={response.usage})"
            )

        if response.stop_reason == "max_tokens":
            logger.warning("Anthropic response truncated (max_tokens=%d, usage=%s)", max_tokens, response.usage)

        return CompletionResult(
            text=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            provider="anthropic",
            model=self.MODEL,
        )

    def stream_with_tools(
        self,
        *,
        system: str,
        messages: list[dict[str, object]],
        tools: list[dict[str, object]] | None = None,
        max_tokens: int,
    ) -> Generator[StreamEvent, None, StreamResult]:
        kwargs: dict[str, object] = {
            "model": self.MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools

        collected_text = ""
        pending_tools: dict[int, dict[str, object]] = {}

        with self._client.messages.stream(**kwargs) as stream:  # type: ignore[arg-type]
            for event in stream:
                if event.type == "content_block_start":
                    block = event.content_block
                    if block.type == "tool_use":
                        pending_tools[event.index] = {"id": block.id, "name": block.name, "json_parts": []}
                elif event.type == "content_block_delta":
                    delta = event.delta
                    text = getattr(delta, "text", None)
                    partial_json = getattr(delta, "partial_json", None)
                    if text is not None:
                        collected_text += str(text)
                        yield TextDelta(str(text))
                    elif partial_json is not None:
                        entry = pending_tools.get(event.index)
                        if entry is not None:
                            json_parts: list[str] = entry["json_parts"]  # type: ignore[assignment]
                            json_parts.append(str(partial_json))

            final = stream.get_final_message()

        tool_calls: list[ToolCallDelta] = []
        for entry in pending_tools.values():
            raw_json = "".join(entry["json_parts"])  # type: ignore[arg-type]
            arguments = json.loads(raw_json) if raw_json else {}
            tc = ToolCallDelta(id=str(entry["id"]), name=str(entry["name"]), arguments=arguments)
            tool_calls.append(tc)
            yield tc

        return StreamResult(
            stop_reason=final.stop_reason or "end_turn",
            text=collected_text,
            tool_calls=tool_calls,
            input_tokens=final.usage.input_tokens,
            output_tokens=final.usage.output_tokens,
            provider="anthropic",
            model=self.MODEL,
        )


class OpenAILLMClient(LLMClient):
    MODEL = "gpt-4o-mini"

    def __init__(self, api_key: str | None = None) -> None:
        from openai import OpenAI

        resolved_key = api_key or os.getenv("OPENAI_API_KEY", "")
        if not resolved_key:
            raise ValueError("OPENAI_API_KEY is not set")
        self._client = OpenAI(api_key=resolved_key)

    @property
    def name(self) -> str:
        return f"OpenAI ({self.MODEL})"

    def complete(self, *, system: str, user_prompt: str, max_tokens: int) -> CompletionResult:
        response = self._client.chat.completions.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
        )

        choice = response.choices[0]
        text = (choice.message.content or "").strip()
        if not text:
            raise ValueError("OpenAI returned empty text")

        if choice.finish_reason == "length":
            logger.warning("OpenAI response truncated (max_tokens=%d)", max_tokens)

        usage = response.usage
        return CompletionResult(
            text=text,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            provider="openai",
            model=self.MODEL,
        )

    def stream_with_tools(
        self,
        *,
        system: str,
        messages: list[dict[str, object]],
        tools: list[dict[str, object]] | None = None,
        max_tokens: int,
    ) -> Generator[StreamEvent, None, StreamResult]:
        oai_messages: list[dict[str, object]] = [{"role": "system", "content": system}, *messages]

        kwargs: dict[str, object] = {
            "model": self.MODEL,
            "max_tokens": max_tokens,
            "messages": oai_messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            kwargs["tools"] = [{"type": "function", "function": t} for t in tools]

        collected_text = ""
        # keyed by tool-call index within the chunk stream
        pending_tools: dict[int, dict[str, object]] = {}
        input_tokens = 0
        output_tokens = 0
        finish_reason = "stop"

        response = self._client.chat.completions.create(**kwargs)  # type: ignore[arg-type]
        for chunk in response:
            if chunk.usage:
                input_tokens = chunk.usage.prompt_tokens or 0
                output_tokens = chunk.usage.completion_tokens or 0

            if not chunk.choices:
                continue
            choice = chunk.choices[0]

            if choice.finish_reason:
                finish_reason = choice.finish_reason

            delta = choice.delta
            if delta.content:
                collected_text += delta.content
                yield TextDelta(delta.content)

            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in pending_tools:
                        pending_tools[idx] = {
                            "id": tc_delta.id or "",
                            "name": tc_delta.function.name if tc_delta.function and tc_delta.function.name else "",
                            "arg_parts": [],
                        }
                    entry = pending_tools[idx]
                    if tc_delta.id:
                        entry["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            entry["name"] = tc_delta.function.name
                        if tc_delta.function.arguments:
                            entry["arg_parts"].append(tc_delta.function.arguments)  # type: ignore[union-attr]

        tool_calls: list[ToolCallDelta] = []
        for entry in pending_tools.values():
            raw_json = "".join(entry["arg_parts"])  # type: ignore[arg-type]
            arguments = json.loads(raw_json) if raw_json else {}
            tc = ToolCallDelta(id=str(entry["id"]), name=str(entry["name"]), arguments=arguments)
            tool_calls.append(tc)
            yield tc

        return StreamResult(
            stop_reason=finish_reason,
            text=collected_text,
            tool_calls=tool_calls,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            provider="openai",
            model=self.MODEL,
        )


_CLIENTS: dict[str, type[LLMClient]] = {}
_INSTANCES: dict[str, LLMClient] = {}


def _load_clients() -> None:
    if _CLIENTS:
        return
    _CLIENTS["anthropic"] = AnthropicLLMClient
    _CLIENTS["openai"] = OpenAILLMClient


def get_llm_client() -> LLMClient:
    """Return a singleton LLM client based on the AI_GRADING_PROVIDER env var.

    Kept as a fallback for system-level calls that aren't tied to a specific
    user (e.g. ops scripts). Feature code should prefer `get_user_llm_client`.
    """
    _load_clients()
    name = os.getenv("AI_GRADING_PROVIDER", "anthropic").lower()
    if name not in _INSTANCES:
        cls = _CLIENTS.get(name)
        if cls is None:
            raise ValueError(f"Unknown LLM provider: {name!r}. Available: {list(_CLIENTS)}")
        _INSTANCES[name] = cls()
    return _INSTANCES[name]


def get_user_llm_client(user: User) -> LLMClient:
    """Create an LLM client using the user's own API key and preferred provider."""
    from app.services.encryption import decrypt

    provider = user.ai_provider
    if provider is None or provider == AIProvider.ANTHROPIC:
        if not user.encrypted_anthropic_key:
            raise ValueError("No Anthropic API key configured")
        api_key = decrypt(user.encrypted_anthropic_key)
        return AnthropicLLMClient(api_key=api_key)
    if provider == AIProvider.OPENAI:
        if not user.encrypted_openai_key:
            raise ValueError("No OpenAI API key configured")
        api_key = decrypt(user.encrypted_openai_key)
        return OpenAILLMClient(api_key=api_key)
    raise ValueError(f"Unknown AI provider: {provider}")


def _classify_provider_error(exc: Exception) -> HTTPException | None:
    """Map known provider SDK errors to appropriate HTTP responses."""
    from anthropic import APIStatusError as AnthropicAPIError
    from openai import APIStatusError as OpenAIAPIError

    if isinstance(exc, (AnthropicAPIError, OpenAIAPIError)):
        error_body = getattr(exc, "body", {}) or {}
        error_detail = error_body.get("error", {}) if isinstance(error_body, dict) else {}
        message = error_detail.get("message", "") if isinstance(error_detail, dict) else str(error_detail)

        error_code = error_detail.get("code", "") if isinstance(error_detail, dict) else ""

        # Content filter / safety block
        is_content_filter = exc.status_code == 400 and (
            "content filtering" in message.lower() or error_code == "content_policy_violation"
        )
        if is_content_filter:
            logger.warning("AI output blocked by content filter: %s", message)
            return HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The AI provider's content filter blocked this request. Try rephrasing your input.",
            )

        # Authentication / invalid API key
        if exc.status_code == 401:
            logger.error("AI provider rejected API key: %s", message)
            return HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your AI API key was rejected. Please check it in Settings.",
            )

        # Rate limiting
        if exc.status_code == 429:
            logger.warning("AI provider rate limit hit: %s", message)
            return HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI rate limit reached. Please wait a moment and try again.",
            )

        # Upstream overloaded (Anthropic 529 / OpenAI 503)
        if exc.status_code in (503, 529):
            logger.warning("AI provider overloaded (status=%d): %s", exc.status_code, message)
            return HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The AI service is temporarily overloaded. Please try again shortly.",
            )

    return None


def _run_completion(llm: LLMClient, *, system: str, user_prompt: str, max_tokens: int) -> CompletionResult:
    try:
        return llm.complete(system=system, user_prompt=user_prompt, max_tokens=max_tokens)
    except (ValueError, TypeError) as exc:
        logger.error("AI provider returned unusable response: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an invalid response. Please try again.",
        ) from exc
    except Exception as exc:
        classified = _classify_provider_error(exc)
        if classified:
            raise classified from exc
        logger.exception("Unexpected error during LLM call")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service encountered an error. Please try again later.",
        ) from exc


def complete(*, system: str, user_prompt: str, max_tokens: int) -> CompletionResult:
    try:
        llm = get_llm_client()
    except ValueError as exc:
        logger.error("AI provider unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured. Please contact the administrator.",
        ) from exc

    return _run_completion(llm, system=system, user_prompt=user_prompt, max_tokens=max_tokens)


def complete_for_user(*, user: User, system: str, user_prompt: str, max_tokens: int) -> CompletionResult:
    try:
        llm = get_user_llm_client(user)
    except ValueError as exc:
        logger.error("User AI provider unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI is not configured. Please add your API key in Settings.",
        ) from exc

    return _run_completion(llm, system=system, user_prompt=user_prompt, max_tokens=max_tokens)
