"""What a user chose for the AI features: the Anthropic model and the effort of each action.

The pure rules (defaults, merge) are in `core/ai_settings.py`. This module reads them from the user row.
"""

from app.core.ai_settings import (
    AiAction,
    AiEffort,
    AnthropicModel,
    resolve_anthropic_model,
    resolve_effort_map,
)
from app.models.user import User


def anthropic_model_of(user: User) -> AnthropicModel:
    return resolve_anthropic_model(user.anthropic_model)


def efforts_of(user: User) -> dict[AiAction, AiEffort]:
    return resolve_effort_map(user.ai_effort)


def merge_effort_update(user: User, incoming: dict[str, AiEffort | None]) -> dict[str, str]:
    """The map to store: the saved levels with the new ones on top. A null level drops the saved one (= default).

    A new dict (not an in-place change), so SQLAlchemy sees the JSONB value as modified.
    """
    merged = {**(user.ai_effort or {}), **incoming}
    return {action: level for action, level in merged.items() if level is not None}
