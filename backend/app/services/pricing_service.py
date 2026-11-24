import logging
import re
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.core.model_registry import SDK_TO_OPENROUTER
from app.crud import model_pricing as pricing_crud

logger = logging.getLogger("smarttutor.pricing")

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

# OpenRouter can list a context variant of a model as `<id>[1m]`. The price rows use the plain id.
_CONTEXT_VARIANT_SUFFIX = re.compile(r"\[[^\]]+\]$")


def _canonical_id(model_id: str) -> str:
    return _CONTEXT_VARIANT_SUFFIX.sub("", model_id)


def fetch_and_update_prices(db: Session) -> int:
    """Fetch current model prices from OpenRouter and upsert into model_pricing.

    Returns number of new price rows inserted.
    """
    our_models = set(SDK_TO_OPENROUTER.values())

    response = httpx.get(OPENROUTER_MODELS_URL, timeout=15)
    response.raise_for_status()

    all_models = response.json().get("data", [])
    prices_by_id: dict[str, dict[str, str | Decimal]] = {}

    for model in all_models:
        listed_id = model.get("id", "")
        model_id = _canonical_id(listed_id)
        if model_id not in our_models:
            continue
        # OpenRouter reports pricing as USD per single token, not per 1K/1M tokens
        pricing = model.get("pricing", {})
        prompt_price = pricing.get("prompt")
        completion_price = pricing.get("completion")
        if prompt_price is None or completion_price is None:
            logger.warning("Missing pricing for %s, skipping", listed_id)
            continue

        entry: dict[str, str | Decimal] = {
            "model_id": model_id,
            "input_price": Decimal(prompt_price),
            "output_price": Decimal(completion_price),
        }
        # The plain id wins. A variant (`[1m]`) is used only when the plain id is not listed.
        if listed_id == model_id:
            prices_by_id[model_id] = entry
        elif model_id not in prices_by_id:
            logger.warning("Using the price of the variant %s for %s", listed_id, model_id)
            prices_by_id[model_id] = entry

    prices = list(prices_by_id.values())
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
    openrouter_id = SDK_TO_OPENROUTER.get(model)
    if not openrouter_id:
        logger.warning("No OpenRouter mapping for model %s", model)
        return None

    price = pricing_crud.get_active_price(db, model_id=openrouter_id)
    if not price:
        return None

    return (Decimal(str(price.input_price)) * input_tokens) + (Decimal(str(price.output_price)) * output_tokens)


def refresh_prices_on_startup() -> None:
    """Fetch prices in a worker thread at app start. Never raises: a failed fetch must not stop the app."""
    if not settings.fetch_prices_on_startup:
        return
    # Imported here: `app.database` raises at import time when DATABASE_URL is not set.
    from app.database import SessionLocal

    try:
        with SessionLocal() as db:
            inserted = fetch_and_update_prices(db)
        logger.info("Startup price fetch done: %d new price row(s)", inserted)
    except Exception as exc:
        logger.warning("Startup price fetch failed: %s", exc)
