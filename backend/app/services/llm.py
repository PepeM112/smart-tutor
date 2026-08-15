"""Shared low-level LLM client — call any provider, get text back.

Both the grading module and note generation use the same underlying LLM
providers.  This module centralises client initialisation and text extraction
so that each feature only needs to supply a system prompt, user prompt, and
max_tokens.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
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


class LLMClient(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def complete(self, *, system: str, user_prompt: str, max_tokens: int) -> CompletionResult:
        """Send a system + user message pair and return the text response with usage data."""
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
