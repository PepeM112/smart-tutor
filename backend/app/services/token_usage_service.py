import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.enums import AIFeature, AIProvider
from app.crud import token_usage as token_usage_crud
from app.schemas.token_usage import TokenUsageDailySummary, TokenUsageSummaryResponse
from app.services.llm import CompletionResult
from app.services.pricing_service import calculate_cost

logger = logging.getLogger("smarttutor.token_usage")

_PROVIDER_MAP: dict[str, AIProvider] = {
    "anthropic": AIProvider.ANTHROPIC,
    "openai": AIProvider.OPENAI,
}


def _format_cost(cost: Decimal | None) -> str | None:
    if cost is None:
        return None
    # 10 decimal places matches the estimated_cost column's Numeric(12, 10) precision
    return str(cost.quantize(Decimal("0.0000000001")))


def record_usage(
    db: Session,
    *,
    user_id: str,
    result: CompletionResult,
    feature: AIFeature,
) -> None:
    """Persist a token usage record from a completion result."""
    provider = _PROVIDER_MAP.get(result.provider, AIProvider.UNKNOWN)
    cost = calculate_cost(
        db,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    token_usage_crud.create(
        db,
        user_id=user_id,
        provider=provider,
        model=result.model,
        feature=feature,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        estimated_cost=cost,
    )


def get_usage_summary(
    db: Session,
    *,
    user_id: str,
    days: int = 30,
) -> TokenUsageSummaryResponse:
    """Return daily usage summaries for the given period."""
    end = date.today()
    start = end - timedelta(days=days - 1)

    rows = token_usage_crud.get_daily_summary(db, user_id=user_id, start_date=start, end_date=end)

    daily = [
        TokenUsageDailySummary(
            date=row.date,
            provider=AIProvider(row.provider),
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            estimated_cost=_format_cost(row.estimated_cost),
        )
        for row in rows
    ]

    total_input = sum(d.input_tokens for d in daily)
    total_output = sum(d.output_tokens for d in daily)

    costs = [Decimal(d.estimated_cost) for d in daily if d.estimated_cost is not None]
    total_cost = sum(costs, Decimal(0)) if costs else None

    return TokenUsageSummaryResponse(
        daily=daily,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_estimated_cost=_format_cost(total_cost),
    )
