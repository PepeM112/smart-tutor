"""Backfill estimated_cost on token_usage rows that have NULL cost.

Uses model_pricing to calculate cost for each row based on its model and created_at date.
Usage: docker exec backend python3 /app/scripts/backfill_costs.py
"""

import logging
import os
import sys

logging.disable(logging.INFO)
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)
sys.path.insert(0, os.path.dirname(script_dir))

from decimal import Decimal

from sqlalchemy import select

from app.core.model_registry import SDK_TO_OPENROUTER
from app.crud.model_pricing import get_active_price
from app.database import SessionLocal
from app.models.token_usage import TokenUsage

db = SessionLocal()

rows = db.scalars(select(TokenUsage).where(TokenUsage.estimated_cost.is_(None))).all()

if not rows:
    print("No rows to backfill")
    sys.exit(0)

updated = 0
skipped = 0

for row in rows:
    openrouter_id = SDK_TO_OPENROUTER.get(row.model)
    if not openrouter_id:
        skipped += 1
        continue

    price = get_active_price(db, model_id=openrouter_id, at_date=row.created_at.date())
    if not price:
        skipped += 1
        continue

    cost = (Decimal(str(price.input_price)) * row.input_tokens) + (Decimal(str(price.output_price)) * row.output_tokens)
    row.estimated_cost = cost
    updated += 1

db.commit()
db.close()

print(f"Backfilled {updated} rows, skipped {skipped}")
