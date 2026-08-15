from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import CreatedAtMixin, generate_ulid


class ModelPricing(Base, CreatedAtMixin):
    __tablename__ = "model_pricing"

    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)
    # OpenRouter model id (e.g. "anthropic/claude-haiku-4.5"), not the SDK model name — see core/model_registry.py
    model_id: Mapped[str] = mapped_column(String(100))
    input_price: Mapped[Decimal] = mapped_column(Numeric(18, 12))
    output_price: Mapped[Decimal] = mapped_column(Numeric(18, 12))
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)

    __table_args__ = (Index("ix_model_pricing_model_valid", "model_id", "valid_from"),)
