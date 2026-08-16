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
    provider = _PROVIDER_MAP.get(result.provider)
    if provider is None:
        logger.warning("Unknown AI provider %r — defaulting to ANTHROPIC for token tracking", result.provider)
        provider = AIProvider.ANTHROPIC
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
    daily = _build_hourly(db, user_id=user_id) if days == 1 else _build_daily(db, user_id=user_id, days=days)

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


def _build_daily(db: Session, *, user_id: str, days: int) -> list[TokenUsageDailySummary]:
    end = date.today()
    start = end - timedelta(days=days - 1)
    rows = token_usage_crud.get_daily_summary(db, user_id=user_id, start_date=start, end_date=end)

    by_date: dict[str, list[TokenUsageDailySummary]] = {}
    for row in rows:
        key = row.date.isoformat()
        by_date.setdefault(key, []).append(
            TokenUsageDailySummary(
                date=key,
                provider=AIProvider(row.provider),
                input_tokens=row.input_tokens,
                output_tokens=row.output_tokens,
                estimated_cost=_format_cost(row.estimated_cost),
            )
        )

    daily: list[TokenUsageDailySummary] = []
    current = start
    while current <= end:
        key = current.isoformat()
        daily.extend(by_date.get(key, [_zero_entry(key)]))
        current += timedelta(days=1)
    return daily


def _build_hourly(db: Session, *, user_id: str) -> list[TokenUsageDailySummary]:
    rows = token_usage_crud.get_hourly_summary(db, user_id=user_id, target_date=date.today())

    by_hour: dict[int, list[TokenUsageDailySummary]] = {}
    for row in rows:
        by_hour.setdefault(row.hour, []).append(
            TokenUsageDailySummary(
                date=f"{row.hour:02d}:00",
                provider=AIProvider(row.provider),
                input_tokens=row.input_tokens,
                output_tokens=row.output_tokens,
                estimated_cost=_format_cost(row.estimated_cost),
            )
        )

    daily: list[TokenUsageDailySummary] = []
    for hour in range(24):
        label = f"{hour:02d}:00"
        daily.extend(by_hour.get(hour, [_zero_entry(label)]))
    return daily


def _zero_entry(period: str) -> TokenUsageDailySummary:
    return TokenUsageDailySummary(
        date=period, provider=AIProvider.ANTHROPIC, input_tokens=0, output_tokens=0, estimated_cost=None
    )
