import os

from app.services.grading.base import GradingProvider

_PROVIDERS: dict[str, type[GradingProvider]] = {}
_INSTANCES: dict[str, GradingProvider] = {}


def _load_providers() -> None:
    if _PROVIDERS:
        return
    from app.services.grading.anthropic_provider import AnthropicGradingProvider
    from app.services.grading.openai_provider import OpenAIGradingProvider

    _PROVIDERS["anthropic"] = AnthropicGradingProvider
    _PROVIDERS["openai"] = OpenAIGradingProvider


def get_grading_provider() -> GradingProvider:
    _load_providers()
    name = os.getenv("AI_GRADING_PROVIDER", "anthropic").lower()
    if name not in _INSTANCES:
        cls = _PROVIDERS.get(name)
        if cls is None:
            raise ValueError(f"Unknown grading provider: {name!r}. Available: {list(_PROVIDERS)}")
        _INSTANCES[name] = cls()
    return _INSTANCES[name]
