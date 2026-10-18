"""Gradebook, AI key status and token spend of a classroom (ST-68 Phase B)."""

from datetime import datetime
from decimal import Decimal

from app.core.enums import GradeCellStatus, KeySource, KeyStatus
from app.schemas.base import BaseSchema


class GradebookColumn(BaseSchema):
    """One published TEST item. `course_id` is None for a loose item of the classroom."""

    item_id: str
    title: str
    course_id: str | None
    pass_threshold: float
    max_attempts: int | None
    due_at: datetime | None
    # `visible_from` is in the future: students do not see the item yet. Teachers see it.
    hidden: bool


class GradebookCourse(BaseSchema):
    """One published course of the classroom. It has one % column."""

    course_id: str
    title: str
    hidden: bool
    # Published items that count for the %.
    total_items: int


class GradebookCell(BaseSchema):
    item_id: str
    status: GradeCellStatus
    # 0..100. None when the student has no graded result. A result in grading is not counted.
    best_score: float | None
    attempts_used: int
    best_result_id: str | None
    # A teacher changed the grade of an answer in a result of this student on this item.
    overridden: bool


class GradebookCourseProgress(BaseSchema):
    course_id: str
    completed_items: int
    percent: int


class GradebookRow(BaseSchema):
    user_id: str
    username: str
    display_name: str | None
    # Same order as `GradebookRead.columns` and `GradebookRead.courses`.
    cells: list[GradebookCell]
    courses: list[GradebookCourseProgress]


class GradebookRead(BaseSchema):
    """The whole gradebook in one response (no paging: a classroom has tens of students)."""

    columns: list[GradebookColumn]
    courses: list[GradebookCourse]
    rows: list[GradebookRow]


class AIKeyStatusRead(BaseSchema):
    """The key that the current user would use for AI in the classroom (and its courses)."""

    status: KeyStatus
    # The Class key has a cap and the student used all of it this month.
    cap_reached: bool
    # Class-key tokens used by the user this month (UTC) in this classroom, and the cap (None = no cap).
    tokens_used_this_month: int
    monthly_token_cap: int | None


class KeySourceUsage(BaseSchema):
    key_source: KeySource
    month_tokens: int
    month_cost: Decimal | None
    total_tokens: int
    total_cost: Decimal | None


class StudentTokenUsage(BaseSchema):
    user_id: str
    username: str
    display_name: str | None
    # Still an ACTIVE student. False for a student who left (the past spend stays).
    is_active: bool
    month_tokens: int
    month_cost: Decimal | None
    total_tokens: int
    total_cost: Decimal | None
    by_source: list[KeySourceUsage]


class ClassroomTokenUsageRead(BaseSchema):
    # First moment of the current UTC month: "this month" starts here.
    month_start: datetime
    students: list[StudentTokenUsage]
