from datetime import date
from decimal import Decimal

from sqlalchemy import Integer, Row, cast, func, select
from sqlalchemy.orm import Session
from sqlalchemy.types import Date

from app.core.enums import AIFeature, AIProvider
from app.models.token_usage import TokenUsage


def create(
    db: Session,
    *,
    user_id: str,
    provider: AIProvider,
    model: str,
    feature: AIFeature,
    input_tokens: int,
    output_tokens: int,
    estimated_cost: Decimal | None = None,
) -> TokenUsage:
    record = TokenUsage(
        user_id=user_id,
        provider=int(provider),
        model=model,
        feature=int(feature),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost=estimated_cost,
    )
    db.add(record)
    db.flush()
    return record


def get_daily_summary(
    db: Session,
    *,
    user_id: str,
    start_date: date,
    end_date: date,
) -> list[Row[tuple[date, int, int, int, Decimal | None]]]:
    stmt = (
        select(
            cast(TokenUsage.created_at, Date).label("date"),
            TokenUsage.provider,
            func.sum(TokenUsage.input_tokens).label("input_tokens"),
            func.sum(TokenUsage.output_tokens).label("output_tokens"),
            func.sum(TokenUsage.estimated_cost).label("estimated_cost"),
        )
        .where(
            TokenUsage.user_id == user_id,
            cast(TokenUsage.created_at, Date) >= start_date,
            cast(TokenUsage.created_at, Date) <= end_date,
        )
        .group_by(cast(TokenUsage.created_at, Date), TokenUsage.provider)
        .order_by(cast(TokenUsage.created_at, Date))
    )
    return list(db.execute(stmt).all())


def get_hourly_summary(
    db: Session,
    *,
    user_id: str,
    target_date: date,
) -> list[Row[tuple[int, int, int, int, Decimal | None]]]:
    hour_col = cast(func.extract("hour", TokenUsage.created_at), Integer)
    stmt = (
        select(
            hour_col.label("hour"),
            TokenUsage.provider,
            func.sum(TokenUsage.input_tokens).label("input_tokens"),
            func.sum(TokenUsage.output_tokens).label("output_tokens"),
            func.sum(TokenUsage.estimated_cost).label("estimated_cost"),
        )
        .where(
            TokenUsage.user_id == user_id,
            cast(TokenUsage.created_at, Date) == target_date,
        )
        .group_by(hour_col, TokenUsage.provider)
        .order_by(hour_col)
    )
    return list(db.execute(stmt).all())
