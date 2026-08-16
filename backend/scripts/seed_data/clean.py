"""Delete all data for a given user."""

from sqlalchemy import text
from sqlalchemy.orm import Session


def clean_user_data(db: Session, user_id: str) -> None:
    uid = {"uid": user_id}
    user_tests = "SELECT id FROM test WHERE user_id = :uid"
    user_groups = f"SELECT id FROM test_question_group WHERE test_id IN ({user_tests})"

    # Delete order follows FK dependencies: children before parents
    db.execute(
        text("DELETE FROM answer WHERE test_result_id IN (SELECT id FROM test_result WHERE user_id = :uid)"), uid
    )
    db.execute(text("DELETE FROM user_question_state WHERE user_id = :uid"), uid)
    db.execute(text("DELETE FROM test_result WHERE user_id = :uid"), uid)
    db.execute(text(f"DELETE FROM question WHERE group_id IN ({user_groups})"), uid)
    db.execute(text(f"DELETE FROM question WHERE test_id IN ({user_tests})"), uid)
    db.execute(text("DELETE FROM question WHERE user_id = :uid AND test_id IS NULL AND group_id IS NULL"), uid)
    db.execute(text(f"DELETE FROM test_question_group WHERE test_id IN ({user_tests})"), uid)
    db.execute(text("DELETE FROM test WHERE user_id = :uid"), uid)
    db.execute(text("DELETE FROM note WHERE user_id = :uid"), uid)
    db.execute(text("DELETE FROM token_usage WHERE user_id = :uid"), uid)
    db.commit()
