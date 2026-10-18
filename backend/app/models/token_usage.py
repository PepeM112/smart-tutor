from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import KeySource
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class TokenUsage(Base, CreatedAtMixin):
    __tablename__ = "token_usage"
    __table_args__ = (Index("ix_token_usage_user_space_source", "user_id", "space_id", "key_source"),)

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"), index=True)
    provider: Mapped[int] = mapped_column(Integer)
    model: Mapped[str] = mapped_column(String(50))
    feature: Mapped[int] = mapped_column(Integer)
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)
    # The classroom (or classroom course) the call was made for (ST-68 Phase B). NULL = personal use.
    space_id: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("space.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Which key paid for the call: KeySource.STUDENT (own key) or CLASS (the Class key of a classroom).
    key_source: Mapped[int] = mapped_column(
        Integer, default=int(KeySource.STUDENT), server_default=str(int(KeySource.STUDENT)), nullable=False
    )
    # Null when no active price was found for the model at usage time
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 10), nullable=True, default=None)
