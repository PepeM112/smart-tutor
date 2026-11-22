from datetime import datetime
from typing import Any, Literal

from app.schemas.base import BaseSchema

# One stable code per refusal that the frontend shows with its own text. The English `detail` can change,
# a code must not. Add a code only for an error the frontend must tell apart.
ErrorCode = Literal[
    "space_archived",
    "removed_course_has_results",
    "attempt_no_attempts_left",
    "attempt_cooldown",
    "attempt_time_over",
    "attempt_closed",
    "attempt_not_open",
    "attempt_window_closed",
    "attempt_no_questions",
    "assist_blocked_by_course_test",
    "ai_not_configured",
    "ai_budget_used_up",
    "override_not_classroom",
    "override_score_out_of_range",
    "answer_overridden",
    "feed_teacher_only_post",
    "feed_teacher_only_comment",
    "feed_author_only_edit",
    "feed_post_not_found",
    "feed_comment_not_found",
    "completion_passed",
    "completion_not_found",
]


class ErrorWithCode(BaseSchema):
    """The body of a coded error: `detail` as in every error, plus a stable `code` and optional fields."""

    detail: str
    code: ErrorCode
    # `attempt_cooldown`: when the next attempt can start.
    next_attempt_at: datetime | None = None
    # `override_score_out_of_range`: the points of the question.
    max_points: float | None = None


def coded_errors(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """For `responses=` of a route: shows `ErrorWithCode` in OpenAPI, so the frontend gets the code type."""
    return {status: {"model": ErrorWithCode} for status in statuses}
