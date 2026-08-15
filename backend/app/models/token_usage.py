from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AIFeature, AIProvider
from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class TokenUsage(Base, CreatedAtMixin):
    __tablename__ = "token_usage"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    user_id: Mapped[str] = mapped_column(String(26), ForeignKey("user.id"), index=True)
    provider: Mapped[int] = mapped_column(Integer, default=int(AIProvider.UNKNOWN))
    model: Mapped[str] = mapped_column(String(50))
    feature: Mapped[int] = mapped_column(Integer, default=int(AIFeature.UNKNOWN))
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)
    # Null when no active price was found for the model at usage time
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 10), nullable=True, default=None)
