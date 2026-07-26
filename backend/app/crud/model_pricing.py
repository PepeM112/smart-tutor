from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.model_pricing import ModelPricing


def get_active_price(
    db: Session,
    *,
    model_id: str,
    at_date: date | None = None,
) -> ModelPricing | None:
    target = at_date or date.today()
    stmt = (
        select(ModelPricing)
        .where(
            ModelPricing.model_id == model_id,
            ModelPricing.valid_from <= target,
            (ModelPricing.valid_to.is_(None)) | (ModelPricing.valid_to >= target),
        )
        .order_by(ModelPricing.valid_from.desc())
        .limit(1)
    )
    return db.scalars(stmt).first()


def upsert_prices(
    db: Session,
    *,
    prices: list[dict[str, str | Decimal]],
) -> int:
    """Close stale rows and insert new prices. Returns count of inserted rows."""
    today = date.today()
    inserted = 0

    for entry in prices:
        model_id = str(entry["model_id"])
        input_price = Decimal(str(entry["input_price"]))
        output_price = Decimal(str(entry["output_price"]))

        current = get_active_price(db, model_id=model_id)
        if current:
            prices_match = (
                Decimal(str(current.input_price)) == input_price and Decimal(str(current.output_price)) == output_price
            )
            if prices_match:
                continue

        if current and current.valid_to is None:
            current.valid_to = today

        db.add(
            ModelPricing(
                model_id=model_id,
                input_price=input_price,
                output_price=output_price,
                valid_from=today,
            )
        )
        inserted += 1

    db.flush()
    return inserted
