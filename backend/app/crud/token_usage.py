from datetime import date
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import Integer, Row, cast, func, literal, select
from sqlalchemy.orm import Session
from sqlalchemy.types import Date

from app.core.enums import AIFeature, AIProvider
from app.models.token_usage import TokenUsage

UsageGroupBy = Literal["provider", "feature", "both"]


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
    group_by: UsageGroupBy = "provider",
    feature_filter: AIFeature | None = None,
) -> list[Row[Any]]:
    date_col = cast(TokenUsage.created_at, Date).label("date")

    include_provider = group_by in ("provider", "both")
    include_feature = group_by in ("feature", "both")

    provider_col: Any = TokenUsage.provider if include_provider else literal(None).label("provider")
    feature_col: Any = TokenUsage.feature if include_feature else literal(None).label("feature")

    conditions: list[Any] = [
        TokenUsage.user_id == user_id,
        date_col >= start_date,
        date_col <= end_date,
    ]
    if feature_filter is not None:
        conditions.append(TokenUsage.feature == int(feature_filter))

    group_cols: list[Any] = [date_col]
    if include_provider:
        group_cols.append(TokenUsage.provider)
    if include_feature:
        group_cols.append(TokenUsage.feature)

    stmt = (
        select(
            date_col,
            provider_col,
            feature_col,
            func.sum(TokenUsage.input_tokens).label("input_tokens"),
            func.sum(TokenUsage.output_tokens).label("output_tokens"),
            func.sum(TokenUsage.estimated_cost).label("estimated_cost"),
        )
        .where(*conditions)
        .group_by(*group_cols)
        .order_by(date_col)
    )
    return list(db.execute(stmt).all())


def get_hourly_summary(
    db: Session,
    *,
    user_id: str,
    target_date: date,
    group_by: UsageGroupBy = "provider",
    feature_filter: AIFeature | None = None,
) -> list[Row[Any]]:
    hour_col = cast(func.extract("hour", TokenUsage.created_at), Integer)

    include_provider = group_by in ("provider", "both")
    include_feature = group_by in ("feature", "both")

    provider_col: Any = TokenUsage.provider if include_provider else literal(None).label("provider")
    feature_col: Any = TokenUsage.feature if include_feature else literal(None).label("feature")

    conditions: list[Any] = [
        TokenUsage.user_id == user_id,
        cast(TokenUsage.created_at, Date) == target_date,
    ]
    if feature_filter is not None:
        conditions.append(TokenUsage.feature == int(feature_filter))

    group_cols: list[Any] = [hour_col]
    if include_provider:
        group_cols.append(TokenUsage.provider)
    if include_feature:
        group_cols.append(TokenUsage.feature)

    stmt = (
        select(
            hour_col.label("hour"),
            provider_col,
            feature_col,
            func.sum(TokenUsage.input_tokens).label("input_tokens"),
            func.sum(TokenUsage.output_tokens).label("output_tokens"),
            func.sum(TokenUsage.estimated_cost).label("estimated_cost"),
        )
        .where(*conditions)
        .group_by(*group_cols)
        .order_by(hour_col)
    )
    return list(db.execute(stmt).all())
