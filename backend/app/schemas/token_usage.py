from datetime import datetime

from app.core.enums import AIFeature, AIProvider
from app.schemas.base import BaseSchema


class TokenUsageRead(BaseSchema):
    id: str
    provider: AIProvider
    model: str
    feature: AIFeature
    input_tokens: int
    output_tokens: int
    # String (not float) to preserve Decimal precision — per-token costs are too small for float
    estimated_cost: str | None
    created_at: datetime


class TokenUsageDailySummary(BaseSchema):
    # "2026-08-16" for daily views, "08:00" for hourly (1D)
    date: str
    provider: AIProvider
    input_tokens: int
    output_tokens: int
    estimated_cost: str | None


class TokenUsageSummaryResponse(BaseSchema):
    daily: list[TokenUsageDailySummary]
    total_input_tokens: int
    total_output_tokens: int
    total_estimated_cost: str | None
