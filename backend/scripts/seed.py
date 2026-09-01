"""Main seed entry point — populates the database with sample data for a user.

Usage: python seed.py <user_email>
Runs inside the backend container via: docker exec -i backend python3 - <email> < scripts/seed.py
"""

import logging
import os
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)
sys.path.insert(0, os.path.dirname(script_dir))

logging.disable(logging.INFO)

from seed_data.clean import clean_user_data  # noqa: E402
from seed_data.notes import seed_notes  # noqa: E402
from seed_data.questions import seed_bank_questions  # noqa: E402
from seed_data.test_results import seed_history_result, seed_spanish_result  # noqa: E402
from seed_data.test_versioning import seed_versioned_edit  # noqa: E402
from seed_data.tests import seed_tests  # noqa: E402
from seed_data.token_usage import seed_token_usage  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: F401, E402 — FK resolution for all ORM models


email = sys.argv[1]
db = SessionLocal()

user = db.execute(text('SELECT id FROM "user" WHERE email = :email'), {"email": email}).fetchone()
if not user:
    print(f"user {email} not found")
    sys.exit(1)

user_id = user[0]

print("Cleaning previous data... ", end="", flush=True)
clean_user_data(db, user_id)
print("done")

print("Creating tests... ", end="", flush=True)
tests = seed_tests(db, user_id)
print(f"done ({len(tests)} tests)")

print("Submitting test results... ", end="", flush=True)
r1 = seed_spanish_result(db, user_id, tests["spanish_vocab"])
r2 = seed_history_result(db, user_id, tests["history"])
print(f"done (Spanish: {r1.score}%, History: {r2.score}%)")

print("Simulating test edit (versioning)... ", end="", flush=True)
seed_versioned_edit(db, tests["spanish_vocab"])
print("done")

print("Creating bank questions... ", end="", flush=True)
bank_questions = seed_bank_questions(db, user_id)
print(f"done ({len(bank_questions)} questions)")

print("Creating notes... ", end="", flush=True)
notes = seed_notes(db, user_id)
print(f"done ({len(notes)} notes)")

print("Seeding token usage... ", end="", flush=True)
token_count = seed_token_usage(db, user_id)
print(f"done ({token_count} records)")

total_q = sum(len(t.questions) + sum(len(g.questions) for g in t.question_groups) for t in tests.values())

db.commit()
db.close()

print(
    f"\nSeed complete: {total_q} test questions, {len(bank_questions)} bank questions, "
    f"{len(notes)} notes, {token_count} token usage records"
)
