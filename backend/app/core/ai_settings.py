"""Model and effort settings of the AI features.

The Literals and the defaults live here, not in `schemas/user.py`, because both the schema layer
(`UserRead` merges the defaults) and `services/llm.py` need them. `schemas/user.py` re-exports the Literals.
"""

from collections.abc import Mapping
from typing import Literal, TypeGuard, get_args

from typing_extensions import TypeAliasType

# `TypeAliasType` and not a bare `Literal`: Pydantic then emits a named schema, so the generated TS client
# gets a named type that the Settings UI imports, not an inline union that every consumer would repeat.
# The stored value is the exact API id. Haiku 4.5 keeps its dated id so old `token_usage` rows still match.
AnthropicModel = TypeAliasType("AnthropicModel", Literal["claude-haiku-4-5-20251001", "claude-haiku-5-5"])
AiEffort = TypeAliasType("AiEffort", Literal["low", "medium", "high", "xhigh", "max"])
# The actions that call an LLM. Answer correction is not one of them: it uses Levenshtein.
AiAction = Literal[
    "grading",
    "challenge",
    "note_generation",
    "note_edit",
    "test_generation",
    "assistant_chat",
]

HAIKU_4_5: AnthropicModel = "claude-haiku-4-5-20251001"
HAIKU_5_5: AnthropicModel = "claude-haiku-5-5"
# A user with no saved model, and every Class key call.
DEFAULT_ANTHROPIC_MODEL: AnthropicModel = HAIKU_5_5

# Only these models take `output_config.effort` (and think before they answer).
EFFORT_MODELS: frozenset[str] = frozenset({HAIKU_5_5})

DEFAULT_AI_EFFORT: dict[AiAction, AiEffort] = {
    "grading": "high",
    "challenge": "high",
    "test_generation": "high",
    "note_generation": "medium",
    "note_edit": "medium",
    "assistant_chat": "medium",
}

_MODELS: tuple[str, ...] = get_args(AnthropicModel.__value__)
_EFFORTS: tuple[str, ...] = get_args(AiEffort.__value__)


def _is_model(value: object) -> TypeGuard[AnthropicModel]:
    return value in _MODELS


def _is_effort(value: object) -> TypeGuard[AiEffort]:
    return value in _EFFORTS


def resolve_anthropic_model(stored: object) -> AnthropicModel:
    """The model of a user row. NULL, and a value that is no longer offered, give the default."""
    return stored if _is_model(stored) else DEFAULT_ANTHROPIC_MODEL


def resolve_effort_map(stored: object) -> dict[AiAction, AiEffort]:
    """The defaults with the saved levels on top. Unknown actions and levels in the row are ignored."""
    saved: Mapping[str, object] = stored if isinstance(stored, Mapping) else {}
    return {
        action: level if _is_effort(level := saved.get(action)) else default
        for action, default in DEFAULT_AI_EFFORT.items()
    }
