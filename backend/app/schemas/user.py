from pydantic import field_validator, model_validator

from app.core.enums import AiProvider, UserStatus
from app.schemas.base import BaseSchema

VALID_LOCALES = {"en", "es"}
VALID_THEMES = {
    "ocean-blue",
    "sky",
    "slate-minimal",
    "sunset",
    "coral",
    "forest",
    "mint",
    "sage",
    "midnight",
    "carbon",
    "neon",
    "noir",
    "system",
}


class UserBase(BaseSchema):
    username: str
    email: str


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseSchema):
    display_name: str | None = None
    locale: str | None = None
    theme: str | None = None
    ai_provider: AiProvider | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    daily_review_limit: int | None = None
    initial_ease_factor: float | None = None

    @field_validator("locale")
    @classmethod
    def _validate_locale(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_LOCALES:
            raise ValueError(f"locale must be one of {sorted(VALID_LOCALES)}")
        return v

    @field_validator("theme")
    @classmethod
    def _validate_theme(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_THEMES:
            raise ValueError(f"theme must be one of {sorted(VALID_THEMES)}")
        return v

    @field_validator("initial_ease_factor")
    @classmethod
    def _validate_ease_factor(cls, v: float | None) -> float | None:
        if v is not None and not (1.3 <= v <= 5.0):
            raise ValueError("initial_ease_factor must be between 1.3 and 5.0")
        return v

    @field_validator("daily_review_limit")
    @classmethod
    def _validate_review_limit(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("daily_review_limit must be at least 1")
        return v


class UserRead(UserBase):
    id: str
    status: UserStatus
    display_name: str | None = None
    locale: str = "en"
    theme: str = "system"
    ai_provider: AiProvider | None = None
    has_anthropic_key: bool = False
    has_openai_key: bool = False
    daily_review_limit: int | None = None
    initial_ease_factor: float = 2.5

    @model_validator(mode="before")
    @classmethod
    def _compute_key_flags(cls, data: dict[str, object]) -> dict[str, object]:
        if not isinstance(data, dict):
            data = {k: v for k, v in vars(data).items() if not k.startswith("_")}
        data["has_anthropic_key"] = bool(data.get("encrypted_anthropic_key"))
        data["has_openai_key"] = bool(data.get("encrypted_openai_key"))
        return data
