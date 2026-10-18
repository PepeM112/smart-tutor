"""Delete all data for a given user."""

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.space import Space
from app.models.user import User
from app.services import space_service


def clean_user_data(db: Session, user_id: str) -> None:
    # Courses first: their tests can have results of other users, which the SQL below does not delete.
    user = db.get(User, user_id)
    if user is not None:
        clean_user_spaces(db, user)
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


def clean_user_spaces(db: Session, user: User) -> None:
    """Delete the courses and classrooms the user owns, through the service: it removes the children first.

    A course inside a classroom goes with its classroom, so only top-level spaces are listed.
    """
    owned = db.scalars(select(Space).where(Space.owner_id == user.id, Space.parent_id.is_(None))).all()
    for space in owned:
        space_service.delete_course_forever(db, space_id=space.id, current_user=user, confirm_title=space.title)
