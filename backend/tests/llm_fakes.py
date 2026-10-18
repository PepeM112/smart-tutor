"""Helper for tests that patch the AI key resolver with a fake client."""

from collections.abc import Callable
from typing import Any

from app.core.enums import AIProvider, KeySource
from app.models.user import User
from app.services.llm_key_service import ResolvedLLM


def resolve_to(llm: Any, *, key_source: KeySource = KeySource.STUDENT) -> Callable[..., ResolvedLLM]:
    """A stand-in for `resolve_llm`. It returns `llm`, with the provider of the user (Anthropic by default)."""

    def _resolve(db: Any, user: User, space_id: str | None = None) -> ResolvedLLM:
        provider = AIProvider.OPENAI if user.ai_provider == int(AIProvider.OPENAI) else AIProvider.ANTHROPIC
        return ResolvedLLM(llm, provider, key_source, space_id)

    return _resolve
