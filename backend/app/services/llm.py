"""Shared low-level LLM client — call any provider, get text back.

Both the grading module and note generation use the same underlying LLM
providers.  This module centralises client initialisation and text extraction
so that each feature only needs to supply a system prompt, user prompt, and
max_tokens.
"""

import logging
import os
from abc import ABC, abstractmethod

from fastapi import HTTPException, status

logger = logging.getLogger("smarttutor.llm")


class LLMClient(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def complete(self, *, system: str, user: str, max_tokens: int) -> str:
        """Send a system + user message pair and return the raw text response."""
        ...


class AnthropicLLMClient(LLMClient):
    MODEL = "claude-haiku-4-5-20251001"

    def __init__(self) -> None:
        from anthropic import Anthropic

        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set")
        self._client = Anthropic(api_key=api_key)

    @property
    def name(self) -> str:
        return f"Anthropic ({self.MODEL})"

    def complete(self, *, system: str, user: str, max_tokens: int) -> str:
        from anthropic.types import TextBlock

        response = self._client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
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

        return text


class OpenAILLMClient(LLMClient):
    MODEL = "gpt-4o-mini"

    def __init__(self) -> None:
        from openai import OpenAI

        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set")
        self._client = OpenAI(api_key=api_key)

    @property
    def name(self) -> str:
        return f"OpenAI ({self.MODEL})"

    def complete(self, *, system: str, user: str, max_tokens: int) -> str:
        response = self._client.chat.completions.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )

        choice = response.choices[0]
        text = (choice.message.content or "").strip()
        if not text:
            raise ValueError("OpenAI returned empty text")

        if choice.finish_reason == "length":
            logger.warning("OpenAI response truncated (max_tokens=%d)", max_tokens)

        return text


_CLIENTS: dict[str, type[LLMClient]] = {}
_INSTANCES: dict[str, LLMClient] = {}


def _load_clients() -> None:
    if _CLIENTS:
        return
    _CLIENTS["anthropic"] = AnthropicLLMClient
    _CLIENTS["openai"] = OpenAILLMClient


def get_llm_client() -> LLMClient:
    """Return a singleton LLM client based on the AI_GRADING_PROVIDER env var."""
    _load_clients()
    name = os.getenv("AI_GRADING_PROVIDER", "anthropic").lower()
    if name not in _INSTANCES:
        cls = _CLIENTS.get(name)
        if cls is None:
            raise ValueError(f"Unknown LLM provider: {name!r}. Available: {list(_CLIENTS)}")
        _INSTANCES[name] = cls()
    return _INSTANCES[name]


def complete(*, system: str, user: str, max_tokens: int) -> str:
    """Get the LLM client and call complete, wrapping errors into HTTPExceptions."""
    try:
        llm = get_llm_client()
    except ValueError as exc:
        logger.error("AI provider unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured. Please contact the administrator.",
        ) from exc

    try:
        return llm.complete(system=system, user=user, max_tokens=max_tokens)
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
