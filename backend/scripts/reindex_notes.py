"""Re-index all notes where is_indexed == False.

Queries unindexed notes and passes each through note_service.schedule_indexing(),
which creates a fresh DB session per note for isolation.
Useful for cleaning up notes that failed during async BackgroundTask processing.

Usage: docker exec backend python3 /app/scripts/reindex_notes.py
"""

import logging
import os
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)
sys.path.insert(0, os.path.dirname(script_dir))

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

from sqlalchemy import select

from app.database import SessionLocal
from app.models.note import Note
from app.services.note_service import schedule_indexing

db = SessionLocal()

rows = db.execute(
    select(Note.id, Note.title).where(Note.is_indexed == False)  # noqa: E712
).all()
db.close()

if not rows:
    print("All notes are indexed — nothing to do.")
    sys.exit(0)

print(f"Found {len(rows)} unindexed note(s). Starting re-index...\n")

succeeded = 0
failed = 0

for note_id, title in rows:
    try:
        schedule_indexing(note_id)
        print(f"  ✓ {note_id}  {title}")
        succeeded += 1
    except Exception as exc:
        print(f"  ✗ {note_id}  {title}  — {exc}")
        failed += 1

print(f"\nDone. Indexed: {succeeded}, Failed: {failed}")
