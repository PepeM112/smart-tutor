"""Fetch model prices from OpenRouter and populate the model_pricing table.

Usage: docker exec backend python3 /app/scripts/fetch_prices.py
"""

import logging
import os
import sys

logging.disable(logging.INFO)
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)
sys.path.insert(0, os.path.dirname(script_dir))

from app.database import SessionLocal  # noqa: E402
from app.services.pricing_service import fetch_and_update_prices  # noqa: E402

db = SessionLocal()

try:
    inserted = fetch_and_update_prices(db)
    if inserted:
        print(f"Updated {inserted} model price(s)")
    else:
        print("All prices are up to date")
except Exception as e:
    print(f"Error fetching prices: {e}", file=sys.stderr)
    sys.exit(1)
finally:
    db.close()
