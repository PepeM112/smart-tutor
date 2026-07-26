"""Seed token_usage with realistic mock data spanning the last 30 days."""

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.enums import AIFeature, AIProvider
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

INSERT = text("""
    INSERT INTO token_usage (id, user_id, provider, model, feature, input_tokens, output_tokens, created_at)
    VALUES (:id, :uid, :provider, :model, :feature, :input_tokens, :output_tokens, :created_at)
""")


def seed_token_usage(db: Session, user_id: str) -> int:
    random.seed(42)
    now = datetime.now(timezone.utc)
    count = 0

    for day_offset in range(30, 0, -1):
        if random.random() < 0.15:
            continue

        day = now - timedelta(days=day_offset)

        num_actions = random.randint(1, 6)
        for _ in range(num_actions):
            provider, model = random.choice(PROVIDERS)
            feature, input_range, output_range = random.choice(FEATURES)

            created_at = day.replace(
                hour=random.randint(8, 22),
                minute=random.randint(0, 59),
                second=random.randint(0, 59),
            )

            db.execute(
                INSERT,
                {
                    "id": generate_ulid(),
                    "uid": user_id,
                    "provider": int(provider),
                    "model": model,
                    "feature": int(feature),
                    "input_tokens": random.randint(*input_range),
                    "output_tokens": random.randint(*output_range),
                    "created_at": created_at,
                },
            )
            count += 1

    db.flush()
    return count
