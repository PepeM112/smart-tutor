from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AiProvider, UserStatus
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class User(Base, CreatedAtMixin):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    username: Mapped[str] = mapped_column(String, index=True, unique=True)
    email: Mapped[str] = mapped_column(String, index=True, unique=True)
    status: Mapped[UserStatus] = mapped_column(default=UserStatus.ACTIVE)
    hashed_password: Mapped[str] = mapped_column(String)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    locale: Mapped[str] = mapped_column(String(5), default="en")
    theme: Mapped[str] = mapped_column(String(10), default="system")
    ai_provider: Mapped[AiProvider | None] = mapped_column(nullable=True, default=None)
    encrypted_anthropic_key: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    encrypted_openai_key: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    daily_review_limit: Mapped[int | None] = mapped_column(nullable=True, default=None)
    initial_ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
