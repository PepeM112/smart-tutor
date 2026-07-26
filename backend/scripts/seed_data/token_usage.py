"""Seed token_usage with realistic mock data spanning the last 30 days."""

import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.enums import AIFeature, AIProvider
from app.core.model_registry import SDK_TO_OPENROUTER
from app.models.base import generate_ulid

PROVIDERS = [
    (AIProvider.ANTHROPIC, "claude-haiku-4-5-20251001"),
    (AIProvider.OPENAI, "gpt-4o-mini"),
]

FEATURES = [
    (AIFeature.GRADING, (800, 2500), (400, 1200)),
    (AIFeature.CHALLENGE, (600, 1800), (300, 900)),
    (AIFeature.NOTE_GENERATION, (1200, 4000), (2000, 6000)),
    (AIFeature.NOTE_REFINEMENT, (1500, 3500), (1000, 3000)),
    (AIFeature.NOTE_CHUNK_EDIT, (800, 2000), (500, 1500)),
    (AIFeature.TEST_GENERATION, (2000, 5000), (3000, 8000)),
]

SEED_PRICES: dict[str, tuple[Decimal, Decimal]] = {
    "anthropic/claude-haiku-4.5": (Decimal("0.000001"), Decimal("0.000005")),
    "openai/gpt-4o-mini": (Decimal("0.00000015"), Decimal("0.0000006")),
}

INSERT_USAGE = text(
    "INSERT INTO token_usage"
    " (id, user_id, provider, model, feature, input_tokens, output_tokens, estimated_cost, created_at)"
    " VALUES (:id, :uid, :provider, :model, :feature, :input_tokens, :output_tokens, :estimated_cost, :created_at)"
)

INSERT_PRICING = text("""
    INSERT INTO model_pricing (id, model_id, input_price, output_price, valid_from, valid_to, created_at)
    VALUES (:id, :model_id, :input_price, :output_price, :valid_from, :valid_to, :created_at)
""")


def seed_token_usage(db: Session, user_id: str) -> int:
    now = datetime.now(timezone.utc)
    today = date.today()

    db.execute(text("DELETE FROM model_pricing"))

    for openrouter_id, (inp, out) in SEED_PRICES.items():
        db.execute(
            INSERT_PRICING,
            {
                "id": generate_ulid(),
                "model_id": openrouter_id,
                "input_price": inp,
                "output_price": out,
                "valid_from": today - timedelta(days=60),
                "valid_to": None,
                "created_at": now - timedelta(days=60),
            },
        )

    random.seed(42)
    count = 0

    for day_offset in range(30, 0, -1):
        if random.random() < 0.15:
            continue

        day = now - timedelta(days=day_offset)

        num_actions = random.randint(1, 6)
        for _ in range(num_actions):
            provider, model = random.choice(PROVIDERS)
            feature, input_range, output_range = random.choice(FEATURES)

            input_tokens = random.randint(*input_range)
            output_tokens = random.randint(*output_range)

            openrouter_id = SDK_TO_OPENROUTER.get(model)
            cost = None
            if openrouter_id and openrouter_id in SEED_PRICES:
                inp_price, out_price = SEED_PRICES[openrouter_id]
                cost = (inp_price * input_tokens) + (out_price * output_tokens)

            created_at = day.replace(
                hour=random.randint(8, 22),
                minute=random.randint(0, 59),
                second=random.randint(0, 59),
            )

            db.execute(
                INSERT_USAGE,
                {
                    "id": generate_ulid(),
                    "uid": user_id,
                    "provider": int(provider),
                    "model": model,
                    "feature": int(feature),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "estimated_cost": cost,
                    "created_at": created_at,
                },
            )
            count += 1

    db.flush()
    return count
