import logging
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.core.model_registry import SDK_TO_OPENROUTER
from app.crud import model_pricing as pricing_crud

logger = logging.getLogger("smarttutor.pricing")

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"


def fetch_and_update_prices(db: Session) -> int:
    """Fetch current model prices from OpenRouter and upsert into model_pricing.

    Returns number of new price rows inserted.
    """
    our_models = set(SDK_TO_OPENROUTER.values())

    response = httpx.get(OPENROUTER_MODELS_URL, timeout=15)
    response.raise_for_status()

    all_models = response.json().get("data", [])
    prices: list[dict[str, str | Decimal]] = []

    for model in all_models:
        model_id = model.get("id", "")
        if model_id not in our_models:
            continue
        # OpenRouter reports pricing as USD per single token, not per 1K/1M tokens
        pricing = model.get("pricing", {})
        prompt_price = pricing.get("prompt")
        completion_price = pricing.get("completion")
        if prompt_price is None or completion_price is None:
            logger.warning("Missing pricing for %s, skipping", model_id)
            continue

        prices.append(
            {
                "model_id": model_id,
                "input_price": Decimal(prompt_price),
                "output_price": Decimal(completion_price),
            }
        )

    if not prices:
        logger.warning("No matching models found in OpenRouter response")
        return 0

    inserted = pricing_crud.upsert_prices(db, prices=prices)
    db.commit()
    return inserted


def calculate_cost(
    db: Session,
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> Decimal | None:
    """Calculate cost for a completion using the active price for the model."""
    openrouter_id = SDK_TO_OPENROUTER.get(model)
    if not openrouter_id:
        logger.warning("No OpenRouter mapping for model %s", model)
        return None

    price = pricing_crud.get_active_price(db, model_id=openrouter_id)
    if not price:
        return None

    return (Decimal(str(price.input_price)) * input_tokens) + (Decimal(str(price.output_price)) * output_tokens)
