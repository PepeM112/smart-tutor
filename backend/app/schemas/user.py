from pydantic import model_validator

from app.core.enums import AiProvider, UserStatus
from app.schemas.base import BaseSchema


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
    def _compute_key_flags(cls, data: object) -> object:
        if isinstance(data, dict):
            data["has_anthropic_key"] = bool(data.get("encrypted_anthropic_key"))
            data["has_openai_key"] = bool(data.get("encrypted_openai_key"))
        elif hasattr(data, "encrypted_anthropic_key"):
            attrs = data.__dict__
            attrs["has_anthropic_key"] = bool(attrs.get("encrypted_anthropic_key"))
            attrs["has_openai_key"] = bool(attrs.get("encrypted_openai_key"))
        return data
