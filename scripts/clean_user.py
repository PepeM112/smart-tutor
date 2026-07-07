"""Delete all data for a given user (tests, results, answers, SRS state).

Usage: python clean_user.py <user_email>
"""

import sys

from app.database import SessionLocal
from sqlalchemy import text

email = sys.argv[1]

db = SessionLocal()

user = db.execute(text("SELECT id FROM \"user\" WHERE email = :email"), {"email": email}).fetchone()
if not user:
    print(f"user {email} not found — nothing to clean")
    sys.exit(0)

uid = user[0]

user_tests = "SELECT id FROM test WHERE user_id = :uid"
user_groups = f"SELECT id FROM test_question_group WHERE test_id IN ({user_tests})"

db.execute(text(f"DELETE FROM answer WHERE test_result_id IN (SELECT id FROM test_result WHERE user_id = :uid)"), {"uid": uid})
db.execute(text(f"DELETE FROM user_question_state WHERE user_id = :uid"), {"uid": uid})
db.execute(text(f"DELETE FROM test_result WHERE user_id = :uid"), {"uid": uid})
db.execute(text(f"DELETE FROM question WHERE group_id IN ({user_groups})"), {"uid": uid})
db.execute(text(f"DELETE FROM question WHERE test_id IN ({user_tests})"), {"uid": uid})
db.execute(text(f"DELETE FROM test_question_group WHERE test_id IN ({user_tests})"), {"uid": uid})
db.execute(text(f"DELETE FROM test WHERE user_id = :uid"), {"uid": uid})

db.commit()
db.close()
print("done")
