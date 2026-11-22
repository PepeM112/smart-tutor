from typing import Literal
from zoneinfo import available_timezones

from pydantic import field_validator, model_validator

from app.core.ai_settings import AiEffort, AnthropicModel, resolve_anthropic_model, resolve_effort_map
from app.core.enums import AIProvider, UserRole, UserStatus
from app.schemas.base import BaseSchema

ToolKind = Literal["read", "write"]
# The `light-*` themes only change the sidebar and, for `-frame`, the ground (see `lib/themes.ts` in the frontend).
ThemeMode = Literal[
    "light",
    "light-frame",
    "light-ink",
    "light-ink-frame",
    "dark",
    "system",
]
TimeFormat = Literal["12h", "24h"]

VALID_LOCALES = {"en", "es"}
# Computed once: `available_timezones()` scans the tz database on every call.
VALID_TIMEZONES = frozenset(available_timezones())


class AiEffortSettings(BaseSchema):
    """The effort level of every AI action. One field per action of `core/ai_settings.AiAction` that calls an LLM."""

    grading: AiEffort
    challenge: AiEffort
    note_generation: AiEffort
    note_edit: AiEffort
    test_generation: AiEffort
    assistant_chat: AiEffort


class AiEffortUpdate(BaseSchema):
    """Partial update: an action that is not set keeps its level. null resets that action to its default."""

    grading: AiEffort | None = None
    challenge: AiEffort | None = None
    note_generation: AiEffort | None = None
    note_edit: AiEffort | None = None
    test_generation: AiEffort | None = None
    assistant_chat: AiEffort | None = None


class UserBase(BaseSchema):
    username: str
    email: str


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseSchema):
    display_name: str | None = None
    locale: str | None = None
    theme: ThemeMode | None = None
    time_format: TimeFormat | None = None
    # null or "" clears the zone: the browser zone is used.
    timezone: str | None = None
    ai_provider: AIProvider | None = None
    # null resets to the default model.
    anthropic_model: AnthropicModel | None = None
    # null resets every action to its default.
    ai_effort: AiEffortUpdate | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    daily_review_limit: int | None = None
    initial_ease_factor: float | None = None

    @field_validator("locale", "theme", "time_format")
    @classmethod
    def _reject_null(cls, v: str | None) -> str | None:
        # These columns are NOT NULL: an explicit null would reach the DB and give a 500, so refuse it here.
        if v is None:
            raise ValueError("value cannot be null")
        return v

    @field_validator("locale")
    @classmethod
    def _validate_locale(cls, v: str) -> str:
        if v not in VALID_LOCALES:
            raise ValueError(f"locale must be one of {sorted(VALID_LOCALES)}")
        return v

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, v: str | None) -> str | None:
        if not v:
            return None
        if v not in VALID_TIMEZONES:
            raise ValueError("timezone must be an IANA zone name, for example Europe/Madrid")
        return v

    @field_validator("initial_ease_factor")
    @classmethod
    def _validate_ease_factor(cls, v: float | None) -> float | None:
        # 1.3 is SM-2's floor for ease factor — below it, intervals shrink indefinitely
        if v is not None and not (1.3 <= v <= 5.0):
            raise ValueError("initial_ease_factor must be between 1.3 and 5.0")
        return v

    @field_validator("daily_review_limit")
    @classmethod
    def _validate_review_limit(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("daily_review_limit must be at least 1")
        return v


_MISSING = object()


class UserRead(UserBase):
    id: str
    status: UserStatus
    role: UserRole
    display_name: str | None = None
    locale: str = "en"
    theme: ThemeMode = "system"
    time_format: TimeFormat = "24h"
    timezone: str | None = None
    ai_provider: AIProvider | None = None
    # The model that runs and the level of every action: the saved values with the defaults merged in.
    # Required in the API: `_compute_key_flags` always fills them, so the client never has to handle a gap.
    anthropic_model: AnthropicModel
    ai_effort: AiEffortSettings
    has_anthropic_key: bool = False
    has_openai_key: bool = False
    daily_review_limit: int | None = None
    initial_ease_factor: float = 2.5

    @model_validator(mode="before")
    @classmethod
    def _compute_key_flags(cls, data: object) -> dict[str, object]:
        if isinstance(data, dict):
            values = dict(data)  # copy: the caller's dict must stay as it is
        else:
            # `getattr` and not `vars()`: `vars()` misses attributes that are expired or not loaded yet.
            names = [*cls.model_fields, "encrypted_anthropic_key", "encrypted_openai_key"]
            values = {name: value for name in names if (value := getattr(data, name, _MISSING)) is not _MISSING}
        values["anthropic_model"] = resolve_anthropic_model(values.get("anthropic_model"))
        values["ai_effort"] = resolve_effort_map(values.get("ai_effort"))
        values["has_anthropic_key"] = bool(values.get("encrypted_anthropic_key"))
        values["has_openai_key"] = bool(values.get("encrypted_openai_key"))
        return values


class AiToolPermissionRead(BaseSchema):
    name: str
    kind: ToolKind
    default_auto_approve: bool
    auto_approve: bool


class AiToolPermissionsUpdate(BaseSchema):
    # Partial map: tool names that are not in it keep their current value.
    permissions: dict[str, bool] | None = None
