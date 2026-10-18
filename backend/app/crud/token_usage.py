from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Integer, Row, case, cast, func, literal, select
from sqlalchemy.orm import Session
from sqlalchemy.types import Date

from app.core.enums import AIFeature, AIProvider, KeySource
from app.models.token_usage import TokenUsage
from app.schemas.token_usage import UsageGroupBy


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
    space_id: str | None = None,
    key_source: KeySource = KeySource.STUDENT,
) -> TokenUsage:
    record = TokenUsage(
        user_id=user_id,
        provider=int(provider),
        model=model,
        feature=int(feature),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost=estimated_cost,
        space_id=space_id,
        key_source=int(key_source),
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
    feature_filter: list[AIFeature] | None = None,
    provider_filter: AIProvider | None = None,
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
    if feature_filter:
        conditions.append(TokenUsage.feature.in_([int(f) for f in feature_filter]))
    if provider_filter is not None:
        conditions.append(TokenUsage.provider == int(provider_filter))

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
    feature_filter: list[AIFeature] | None = None,
    provider_filter: AIProvider | None = None,
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
    if feature_filter:
        conditions.append(TokenUsage.feature.in_([int(f) for f in feature_filter]))
    if provider_filter is not None:
        conditions.append(TokenUsage.provider == int(provider_filter))

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


def sum_paid_by_class(db: Session, *, user_id: str, space_ids: Sequence[str], since: datetime) -> int:
    """Tokens (input + output) that the classroom paid for the user in these spaces since `since`."""
    stmt = select(func.coalesce(func.sum(TokenUsage.input_tokens + TokenUsage.output_tokens), 0)).where(
        TokenUsage.user_id == user_id,
        TokenUsage.space_id.in_(space_ids),
        TokenUsage.key_source == int(KeySource.CLASS),
        TokenUsage.created_at >= since,
    )
    return int(db.scalar(stmt) or 0)


def spend_by_user_and_source(db: Session, *, space_ids: Sequence[str], month_start: datetime) -> list[Row[Any]]:
    """One row per (user, key source) for the spaces: tokens and cost for this month and in total."""
    this_month = TokenUsage.created_at >= month_start
    tokens = TokenUsage.input_tokens + TokenUsage.output_tokens
    stmt = (
        select(
            TokenUsage.user_id,
            TokenUsage.key_source,
            func.sum(case((this_month, tokens), else_=0)).label("month_tokens"),
            func.sum(case((this_month, TokenUsage.estimated_cost), else_=None)).label("month_cost"),
            func.sum(tokens).label("total_tokens"),
            func.sum(TokenUsage.estimated_cost).label("total_cost"),
        )
        .where(TokenUsage.space_id.in_(space_ids))
        .group_by(TokenUsage.user_id, TokenUsage.key_source)
    )
    return list(db.execute(stmt).all())
