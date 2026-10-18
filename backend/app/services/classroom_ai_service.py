"""AI key status and spend of a classroom (ST-68 Phase B, R36 and R39)."""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.enums import KeySource, KeyStatus
from app.crud import classroom_settings as classroom_settings_crud
from app.crud import space_member as space_member_crud
from app.crud import token_usage as token_usage_crud
from app.crud import user as user_crud
from app.models.user import User
from app.schemas.classroom_grades import (
    AIKeyStatusRead,
    ClassroomTokenUsageRead,
    KeySourceUsage,
    StudentTokenUsage,
)
from app.services import llm_key_service
from app.services.space_service import forbidden, get_classroom_or_404, get_membership, require_owner


def get_key_status(db: Session, *, classroom_id: str, current_user: User) -> AIKeyStatusRead:
    """Which key the user would use in this classroom. Any member can ask. A stranger gets 403."""
    classroom = get_classroom_or_404(db, space_id=classroom_id)
    if get_membership(db, space=classroom, user=current_user).role is None:
        raise forbidden()

    plan = llm_key_service.plan_key(db, current_user, classroom.id)
    status = (
        KeyStatus.NONE
        if plan.source is None
        else (KeyStatus.CLASS if plan.source == KeySource.CLASS else KeyStatus.STUDENT)
    )

    # The cap only applies to a student that can use the Class key. For others the numbers are 0 / None.
    settings = classroom_settings_crud.get(db, space_id=classroom.id)
    can_use_class_key = llm_key_service.can_use_class_key(
        db, classroom=classroom, settings=settings, user_id=current_user.id
    )
    cap = settings.monthly_token_cap_per_student if settings is not None and can_use_class_key else None
    used = (
        token_usage_crud.sum_paid_by_class(
            db,
            user_id=current_user.id,
            space_ids=llm_key_service.classroom_family_ids(db, classroom.id),
            since=llm_key_service.month_start(),
        )
        if can_use_class_key
        else 0
    )
    return AIKeyStatusRead(
        status=status,
        cap_reached=cap is not None and used >= cap,
        tokens_used_this_month=used,
        monthly_token_cap=cap,
    )


def _sum(values: list[Decimal | None]) -> Decimal | None:
    """None when no value has a cost (the model has no price), else the sum of the known ones."""
    known = [v for v in values if v is not None]
    return sum(known, Decimal(0)) if known else None


def get_token_usage(db: Session, *, classroom_id: str, current_user: User) -> ClassroomTokenUsageRead:
    """Spend per student, split by key source. Owner only. Students that left keep their past spend.

    The owner and the co-teachers are not listed: they have no Class key spend, and their own-key
    Assistant use in the classroom is not a student cost.
    """
    classroom = get_classroom_or_404(db, space_id=classroom_id)
    require_owner(db, space=classroom, user=current_user)

    start = llm_key_service.month_start()
    teacher_ids = {classroom.owner_id, *space_member_crud.list_active_editor_ids(db, space_id=classroom.id)}
    rows = [
        row
        for row in token_usage_crud.spend_by_user_and_source(
            db, space_ids=llm_key_service.classroom_family_ids(db, classroom.id), month_start=start
        )
        if row.user_id not in teacher_ids
    ]
    active = {user.id: user for _member, user in space_member_crud.list_active_students(db, space_id=classroom.id)}
    spent_ids = {row.user_id for row in rows}
    users = {u.id: u for u in user_crud.list_by_ids(db, ids=list({*active, *spent_ids}))}

    def student(user_id: str) -> StudentTokenUsage:
        user = users[user_id]
        by_source = [
            KeySourceUsage(
                key_source=KeySource(row.key_source),
                month_tokens=int(row.month_tokens or 0),
                month_cost=row.month_cost,
                total_tokens=int(row.total_tokens or 0),
                total_cost=row.total_cost,
            )
            for row in rows
            if row.user_id == user_id
        ]
        return StudentTokenUsage(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            is_active=user_id in active,
            month_tokens=sum(s.month_tokens for s in by_source),
            month_cost=_sum([s.month_cost for s in by_source]),
            total_tokens=sum(s.total_tokens for s in by_source),
            total_cost=_sum([s.total_cost for s in by_source]),
            by_source=by_source,
        )

    ordered = sorted(users, key=lambda uid: users[uid].username.lower())
    return ClassroomTokenUsageRead(month_start=start, students=[student(uid) for uid in ordered])
