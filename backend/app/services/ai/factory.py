import os

from app.services.ai.base import AIProvider

_PROVIDERS: dict[str, type[AIProvider]] = {}
_INSTANCES: dict[str, AIProvider] = {}


def _load_providers() -> None:
    if _PROVIDERS:
        return
    from app.services.ai.anthropic_provider import AnthropicAIProvider
    from app.services.ai.openai_provider import OpenAIAIProvider

    _PROVIDERS["anthropic"] = AnthropicAIProvider
    _PROVIDERS["openai"] = OpenAIAIProvider


def get_ai_provider() -> AIProvider:
    _load_providers()
    name = os.getenv("AI_PROVIDER", "anthropic").lower()
    if name not in _INSTANCES:
        cls = _PROVIDERS.get(name)
        if cls is None:
            raise ValueError(f"Unknown AI provider: {name!r}. Available: {list(_PROVIDERS)}")
        _INSTANCES[name] = cls()
    return _INSTANCES[name]
