"""Which AI key pays for a call (ST-68 Phase B, R36-R39).

One resolver for all AI features. A call can use the key of the student or the Class key of a classroom.
The rules:

- Neither key exists: blocked.
- Only the student key exists: the student key.
- Both exist: `key_priority` of the classroom decides. A Class key over its monthly cap falls back to the student key.
- Only the Class key exists: the Class key. Over the cap: blocked.

The Class key serves only students (ACTIVE VIEWER) of the classroom. `key_scope` says where:
- CLASSROOM_CONTENT: only calls made for the classroom or one of its courses (`space_id` is set).
- ALL: also personal calls (`space_id` is None). The first classroom (oldest) with a usable Class key pays,
  and the usage is tagged with that classroom, so the owner sees it in the spend per student.
"""

from dataclasses import dataclass, replace
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.enums import AIProvider, KeyPriority, KeySource, SpaceKind, SpaceRole
from app.crud import classroom_settings as classroom_settings_crud
from app.crud import space as space_crud
from app.crud import space_item as space_item_crud
from app.crud import space_member as space_member_crud
from app.crud import token_usage as token_usage_crud
from app.models.classroom_settings import ClassroomSettings
from app.models.space import Space
from app.models.test_result import TestResult
from app.models.user import User
from app.services import access_service, encryption
from app.services.llm import (
    CAP_REACHED_MESSAGE,
    NO_KEY_MESSAGE,
    AIKeyError,
    CompletionResult,
    LLMClient,
    build_client,
    get_user_llm_client,
)


@dataclass(frozen=True, slots=True)
class ResolvedLLM:
    client: LLMClient
    provider: AIProvider
    key_source: KeySource
    # The classroom (or classroom course) the usage is booked on. None = personal use paid by the student.
    space_id: str | None

    def tag(self, result: CompletionResult) -> CompletionResult:
        """Add who paid and for which space to a result, so `record_usage` can store it."""
        return replace(result, key_source=self.key_source, space_id=self.space_id)


@dataclass(frozen=True, slots=True)
class KeyPlan:
    """The decision before a client exists. `source` None = blocked, and `message` says why."""

    source: KeySource | None
    # The settings row of the classroom that pays (only for CLASS).
    settings: ClassroomSettings | None = None
    classroom_id: str | None = None
    message: str | None = None
    cap_reached: bool = False


def month_start(now: datetime | None = None) -> datetime:
    """The first moment of the current UTC calendar month."""
    current = now or datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def classroom_of(db: Session, space_id: str | None) -> Space | None:
    """The classroom of a space: the space itself, or the parent of a classroom course. None for a standalone course."""
    if space_id is None:
        return None
    space = space_crud.get_by_id(db, id=space_id)
    if space is None:
        return None
    if space.kind == int(SpaceKind.CLASSROOM):
        return space
    return space_crud.get_by_id(db, id=space.parent_id) if space.parent_id else None


def space_id_of_result(db: Session, test_result: TestResult) -> str | None:
    """The space of the item of a course result. None for a personal result."""
    if test_result.space_item_id is None:
        return None
    item = space_item_crud.get(db, item_id=test_result.space_item_id)
    return item.space_id if item is not None else None


def classroom_family_ids(db: Session, classroom_id: str) -> list[str]:
    """The classroom id and the ids of its courses. The cap and the spend count all of them."""
    return [classroom_id, *(c.id for c in space_crud.list_children(db, parent_id=classroom_id))]


def has_student_key(user: User) -> bool:
    """True when the user has a key for the provider that they selected."""
    if user.ai_provider == int(AIProvider.OPENAI):
        return bool(user.encrypted_openai_key)
    return bool(user.encrypted_anthropic_key)


def has_class_key(settings: ClassroomSettings | None) -> bool:
    return settings is not None and bool(settings.encrypted_class_key) and settings.ai_provider is not None


def is_class_key_student(db: Session, *, classroom_id: str, user_id: str) -> bool:
    """Only an ACTIVE student (VIEWER) can use the Class key."""
    roles = space_member_crud.list_active_roles(db, user_id=user_id, space_ids=[classroom_id])
    return roles.get(classroom_id) == int(SpaceRole.VIEWER)


def _is_over_cap(db: Session, *, user_id: str, classroom_id: str, settings: ClassroomSettings) -> bool:
    cap = settings.monthly_token_cap_per_student
    if cap is None:
        return False
    used = token_usage_crud.sum_paid_by_class(
        db,
        user_id=user_id,
        space_ids=classroom_family_ids(db, classroom_id),
        since=month_start(),
    )
    return used >= cap


def _plan_for_classroom(
    db: Session, *, user: User, classroom: Space, settings: ClassroomSettings | None, student_key: bool
) -> KeyPlan:
    """The R38 matrix for one classroom."""
    class_key = has_class_key(settings) and is_class_key_student(db, classroom_id=classroom.id, user_id=user.id)
    if not class_key or settings is None:
        return KeyPlan(KeySource.STUDENT) if student_key else KeyPlan(None, message=NO_KEY_MESSAGE)

    over_cap = _is_over_cap(db, user_id=user.id, classroom_id=classroom.id, settings=settings)
    class_plan = KeyPlan(KeySource.CLASS, settings=settings, classroom_id=classroom.id)
    if not student_key:
        if over_cap:
            return KeyPlan(None, message=CAP_REACHED_MESSAGE, cap_reached=True)
        return class_plan
    if settings.key_priority == int(KeyPriority.STUDENT) or over_cap:
        return KeyPlan(KeySource.STUDENT)
    return class_plan


def plan_key(db: Session, user: User, space_id: str | None) -> KeyPlan:
    """Decide which key pays. No client is made here, so the status endpoint can use it too."""
    student_key = has_student_key(user)
    if space_id is not None:
        classroom = classroom_of(db, space_id)
        if classroom is None:
            return KeyPlan(KeySource.STUDENT) if student_key else KeyPlan(None, message=NO_KEY_MESSAGE)
        settings = classroom_settings_crud.get(db, space_id=classroom.id)
        return _plan_for_classroom(db, user=user, classroom=classroom, settings=settings, student_key=student_key)

    # A personal call: only a Class key with scope ALL may pay. The first classroom that can pay wins.
    # A classroom that cannot pay (the cap, or the student key goes first) does not block the next one.
    blocked: KeyPlan | None = None
    for classroom, settings in classroom_settings_crud.list_funding_personal_ai(db, user_id=user.id):
        plan = _plan_for_classroom(db, user=user, classroom=classroom, settings=settings, student_key=student_key)
        if plan.source == KeySource.CLASS:
            return plan
        if plan.source is None and blocked is None:
            blocked = plan
    if student_key:
        return KeyPlan(KeySource.STUDENT)
    return blocked or KeyPlan(None, message=NO_KEY_MESSAGE)


def resolve_llm(db: Session, user: User, space_id: str | None = None) -> ResolvedLLM:
    """The client for a call, and who pays for it. Raises `AIKeyError` when no key can be used."""
    plan = plan_key(db, user, space_id)
    if plan.source is None:
        raise AIKeyError(plan.message or NO_KEY_MESSAGE, cap_reached=plan.cap_reached)

    if plan.source == KeySource.CLASS and plan.settings is not None and plan.settings.encrypted_class_key:
        provider = AIProvider(plan.settings.ai_provider)
        client = build_client(provider, encryption.decrypt(plan.settings.encrypted_class_key))
        # A personal call paid by a classroom is booked on the classroom.
        return ResolvedLLM(client, provider, KeySource.CLASS, space_id or plan.classroom_id)

    provider = AIProvider.OPENAI if user.ai_provider == int(AIProvider.OPENAI) else AIProvider.ANTHROPIC
    # The usage is booked on the space only when the user is a member of it, so nobody can book on a foreign space.
    is_member = space_id is not None and access_service.get_space_access(db, space_id=space_id, user_id=user.id).role
    booked = space_id if is_member else None
    return ResolvedLLM(get_user_llm_client(user), provider, KeySource.STUDENT, booked)
