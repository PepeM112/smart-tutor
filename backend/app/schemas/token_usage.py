from datetime import date, datetime

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
    date: date
    provider: AIProvider
    input_tokens: int
    output_tokens: int
    estimated_cost: str | None


class TokenUsageSummaryResponse(BaseSchema):
    daily: list[TokenUsageDailySummary]
    total_input_tokens: int
    total_output_tokens: int
    total_estimated_cost: str | None
