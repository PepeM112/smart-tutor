"""Courses: CRUD, lists (my courses, catalog, invitations), archive, delete forever, duplicate.

The rules for one row of content (note, test, question) live in `access_service`. This module
has the space-level rules: who sees a course, who edits its metadata, when it is read-only.
Members: `space_member_service`. Edit mode and publish: `space_draft_service`.
"""

import secrets
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.constants import SPACE_JOIN_CODE_LENGTH
from app.core.enums import (
    MemberStatus,
    RevealAnswers,
    SpaceItemKind,
    SpaceKind,
    SpaceRole,
    SpaceStatus,
    SpaceVisibility,
)
from app.crud import note as note_crud
from app.crud import space as space_crud
from app.crud import space_content as space_content_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_test as space_item_test_crud
from app.crud import space_member as space_member_crud
from app.crud import space_section as space_section_crud
from app.crud import test as test_crud
from app.crud import user as user_crud
from app.models.note import Note
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_member import SpaceMember
from app.models.space_section import SpaceSection
from app.models.user import User
from app.schemas.space import (
    SpaceCatalogSort,
    SpaceCreate,
    SpaceDetail,
    SpaceDuplicateRequest,
    SpaceItemRead,
    SpaceItemVariantRead,
    SpaceListStatus,
    SpaceSectionRead,
    SpaceSummary,
    SpaceUpdate,
)
from app.services import space_progress_service
from app.services.access_service import EDIT_ROLES
from app.services.space_changes_service import has_unpublished_changes, item_changed
from app.services.versioning_service import clone_test

# Lowercase letters and digits without look-alikes (0/o, 1/l/i), so a code read aloud is not mistyped.
_JOIN_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_JOIN_CODE_ATTEMPTS = 10

# Non-members can preview the structure of a published course with these visibilities.
_PREVIEW_VISIBILITIES = frozenset({int(SpaceVisibility.PUBLIC), int(SpaceVisibility.UNLISTED)})


@dataclass(frozen=True)
class Membership:
    """The relation of one user to one course. `row` is None for the owner and for strangers."""

    role: SpaceRole | None
    row: SpaceMember | None

    @property
    def can_author(self) -> bool:
        return self.role in EDIT_ROLES

    @property
    def is_owner(self) -> bool:
        return self.role == SpaceRole.OWNER


# ── Shared helpers (also used by the member and draft services) ──────────────


def now() -> datetime:
    return datetime.now(timezone.utc)


def get_course_or_404(db: Session, *, space_id: str, for_update: bool = False) -> Space:
    """A standalone course. Classrooms and classroom courses (M4) are 404 for this API."""
    fetch = space_crud.get_by_id_for_update if for_update else space_crud.get_by_id
    space = fetch(db, id=space_id)
    if space is None or space.kind != int(SpaceKind.COURSE) or space.parent_id is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return space


def get_membership(db: Session, *, space: Space, user: User) -> Membership:
    if space.owner_id == user.id:
        return Membership(role=SpaceRole.OWNER, row=None)
    row = space_member_crud.get(db, space_id=space.id, user_id=user.id)
    role = SpaceRole(row.role) if row is not None and row.status == int(MemberStatus.ACTIVE) else None
    return Membership(role=role, row=row)


def forbidden(detail: str = "Access denied") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def require_active(space: Space) -> None:
    """Archived courses are read-only for everyone."""
    if space.status != int(SpaceStatus.ACTIVE):
        raise conflict("The course is archived")


def require_owner(db: Session, *, space: Space, user: User) -> Membership:
    membership = get_membership(db, space=space, user=user)
    if not membership.is_owner:
        raise forbidden("Only the owner can do this")
    return membership


def require_author(db: Session, *, space: Space, user: User) -> Membership:
    """OWNER or EDITOR."""
    membership = get_membership(db, space=space, user=user)
    if not membership.can_author:
        raise forbidden()
    return membership


def _new_join_code(db: Session) -> str:
    """A random code that no other space uses. 31^7 codes, so a retry is rare."""
    for _ in range(_JOIN_CODE_ATTEMPTS):
        code = "".join(secrets.choice(_JOIN_CODE_ALPHABET) for _ in range(SPACE_JOIN_CODE_LENGTH))
        if not space_crud.join_code_exists(db, code=code):
            return code
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not make a join code")


# ── Read models ───────────────────────────────────────────────────────────────


def _owner_name(user: User | None) -> str:
    if user is None:
        return ""
    return user.display_name or user.username


def build_summaries(db: Session, *, spaces: Sequence[Space], current_user: User) -> list[SpaceSummary]:
    """One query each for owners, member counts and the rows of the current user (no N+1)."""
    space_ids = [s.id for s in spaces]
    owners = {u.id: u for u in user_crud.list_by_ids(db, ids=list({s.owner_id for s in spaces}))}
    counts = space_crud.count_active_members(db, space_ids=space_ids)
    rows = space_member_crud.get_statuses(db, user_id=current_user.id, space_ids=space_ids)
    viewer_ids = [
        s.id
        for s in spaces
        if s.owner_id != current_user.id
        and (row := rows.get(s.id)) is not None
        and row == (int(SpaceRole.VIEWER), int(MemberStatus.ACTIVE))
    ]
    progress = space_progress_service.course_progress(db, space_ids=viewer_ids, user_id=current_user.id)
    srs_space_ids = space_member_crud.list_srs_space_ids(db, user_id=current_user.id, space_ids=space_ids)

    def my_role(space: Space) -> SpaceRole | None:
        if space.owner_id == current_user.id:
            return SpaceRole.OWNER
        row = rows.get(space.id)
        return SpaceRole(row[0]) if row is not None and row[1] == int(MemberStatus.ACTIVE) else None

    def my_status(space: Space) -> MemberStatus | None:
        row = rows.get(space.id)
        return MemberStatus(row[1]) if row is not None else None

    return [
        SpaceSummary(
            id=s.id,
            kind=SpaceKind(s.kind),
            owner_id=s.owner_id,
            owner_name=_owner_name(owners.get(s.owner_id)),
            title=s.title,
            description=s.description,
            tags=s.tags,
            visibility=SpaceVisibility(s.visibility),
            status=SpaceStatus(s.status),
            published_at=s.published_at,
            archived_at=s.archived_at,
            created_at=s.created_at,
            member_count=counts.get(s.id, 0),
            my_role=my_role(s),
            my_status=my_status(s),
            progress=progress.get(s.id),
            include_in_srs=s.id in srs_space_ids,
        )
        for s in spaces
    ]


def _build_sections(
    db: Session, *, space_id: str, is_draft: bool, viewer_id: str | None = None, can_author: bool = False
) -> list[SpaceSectionRead]:
    """The structure with the title of each item.

    For a draft item, the title comes from the draft twin when one exists, and `has_changes`
    marks a new item, new content, an edited twin, or a changed policy or variant list.
    A TEST item shows its first variant (`test_id`, `title`). `can_author` adds the variant list.
    `viewer_id` (a VIEWER of the course) adds the per-user progress fields: one query per kind.
    """
    sections = space_section_crud.list_by_space(db, space_id=space_id, is_draft=is_draft)
    items = space_item_crud.list_by_space(db, space_id=space_id, is_draft=is_draft)
    published = (
        {i.id: i for i in space_item_crud.list_by_space(db, space_id=space_id, is_draft=False)} if is_draft else {}
    )
    links = space_item_test_crud.list_by_items(db, item_ids=[i.id for i in [*items, *published.values()]])
    note_ids = [i.note_id for i in items if i.note_id]
    test_ids = [t for i in items for t in links.get(i.id, [])]
    notes = {n.id: n for n in space_content_crud.list_notes(db, ids=note_ids)}
    tests = {t.id: t for t in space_content_crud.list_tests(db, ids=test_ids)}
    note_twins = (
        {n.draft_of_id: n for n in space_content_crud.list_note_twins(db, published_ids=note_ids)} if is_draft else {}
    )
    test_twins = (
        {t.draft_of_id: t for t in space_content_crud.list_test_twins(db, published_ids=test_ids)} if is_draft else {}
    )
    states = space_progress_service.item_states(db, items=items, user_id=viewer_id) if viewer_id else {}

    def item_read(item: SpaceItem) -> SpaceItemRead:
        variant_ids = links.get(item.id, [])
        content_id = item.note_id or (variant_ids[0] if variant_ids else "")
        source = notes.get(content_id) or tests.get(content_id)
        shown = note_twins.get(content_id) or test_twins.get(content_id) or source
        is_test = item.kind == int(SpaceItemKind.TEST)
        live = published.get(item.draft_of_id or "")
        has_changes = is_draft and (
            item.draft_of_id is None
            or live is None
            or item_changed(item, live, links)
            or any(
                (tests.get(c) is not None and tests[c].is_draft) or c in test_twins or c in note_twins
                for c in ([item.note_id] if item.note_id else variant_ids)
            )
        )
        state = states.get(item.id)
        attempt = state.open_attempt if state else None
        return SpaceItemRead(
            id=item.id,
            section_id=item.section_id,
            kind=SpaceItemKind(item.kind),
            note_id=item.note_id,
            test_id=variant_ids[0] if variant_ids else None,
            position=item.position,
            title=shown.title if shown is not None else "",
            is_draft=item.is_draft,
            draft_of_id=item.draft_of_id,
            has_changes=has_changes,
            pass_threshold=item.pass_threshold if is_test else None,
            max_attempts=item.max_attempts,
            cooldown_hours=item.cooldown_hours,
            reveal_answers=RevealAnswers(item.reveal_answers) if is_test else None,
            time_limit_minutes=item.time_limit_minutes,
            variants=[
                SpaceItemVariantRead(
                    test_id=t,
                    title=(test_twins.get(t) or tests[t]).title if t in tests else "",
                    position=position,
                )
                for position, t in enumerate(variant_ids)
            ]
            if can_author and is_test
            else [],
            completed=state.completed if state else False,
            best_score=state.best_score if state else None,
            attempts_used=state.attempts_used if state else None,
            attempts_left=state.attempts_left if state else None,
            next_attempt_at=state.next_attempt_at if state else None,
            open_attempt_id=attempt.id if attempt else None,
            open_attempt_deadline_at=attempt.deadline_at if attempt else None,
        )

    def section_read(section: SpaceSection) -> SpaceSectionRead:
        return SpaceSectionRead(
            id=section.id,
            title=section.title,
            position=section.position,
            is_draft=section.is_draft,
            draft_of_id=section.draft_of_id,
            items=[item_read(i) for i in items if i.section_id == section.id],
        )

    return [section_read(s) for s in sections]


def build_detail(db: Session, *, space: Space, current_user: User) -> SpaceDetail:
    """The course page. Members see the published structure; authors in edit mode also see the draft.

    A non-member sees a preview (structure, no content access) of a published PUBLIC / UNLISTED
    course, and the metadata only when they have a pending row (invited or requested). Else 403.
    """
    membership = get_membership(db, space=space, user=current_user)
    is_member = membership.role is not None
    can_preview = space.published_at is not None and space.visibility in _PREVIEW_VISIBILITIES
    if not is_member and not can_preview and membership.row is None:
        raise forbidden()

    summary = build_summaries(db, spaces=[space], current_user=current_user)[0]
    is_editing = space.draft_started_at is not None
    show_draft = membership.can_author and is_editing
    return SpaceDetail(
        **summary.model_dump(),
        can_edit=membership.can_author and space.status == int(SpaceStatus.ACTIVE),
        is_owner=membership.is_owner,
        is_editing=is_editing,
        has_unpublished_changes=show_draft and has_unpublished_changes(db, space=space),
        join_code=space.join_code if membership.can_author else None,
        sections=(
            _build_sections(
                db,
                space_id=space.id,
                is_draft=False,
                viewer_id=current_user.id if membership.role == SpaceRole.VIEWER else None,
                can_author=membership.can_author,
            )
            if is_member or can_preview
            else []
        ),
        draft_sections=(_build_sections(db, space_id=space.id, is_draft=True, can_author=True) if show_draft else None),
    )


# ── Course CRUD ───────────────────────────────────────────────────────────────


def create_course(db: Session, *, current_user: User, data: SpaceCreate) -> SpaceDetail:
    """A new course starts in edit mode: it has nothing published yet."""
    space = space_crud.create(
        db,
        kind=int(SpaceKind.COURSE),
        owner_id=current_user.id,
        title=data.title,
        description=data.description,
        tags=data.tags,
        visibility=int(data.visibility),
        join_code=_new_join_code(db),
        draft_started_at=now(),
    )
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def get_course(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    space = get_course_or_404(db, space_id=space_id)
    return build_detail(db, space=space, current_user=current_user)


def update_course(db: Session, *, space_id: str, current_user: User, data: SpaceUpdate) -> SpaceDetail:
    space = get_course_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    require_active(space)
    space_crud.update(db, space=space, data=data)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def set_archived(db: Session, *, space_id: str, current_user: User, archived: bool) -> SpaceDetail:
    space = get_course_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    space_crud.set_status(
        db,
        space=space,
        status=int(SpaceStatus.ARCHIVED if archived else SpaceStatus.ACTIVE),
        archived_at=now() if archived else None,
    )
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def delete_course_forever(db: Session, *, space_id: str, current_user: User, confirm_title: str) -> None:
    """Hard delete with all content and exam history. The typed title must match exactly.

    Tests go first through `delete_tests_forever`: their child FKs have no `ondelete`, so the
    space cascade alone would fail. Notes, structure and members then go with the DB cascade.
    Personal tests made from a course note survive (`source_note_id → NULL`).
    """
    space = get_course_or_404(db, space_id=space_id, for_update=True)
    require_owner(db, space=space, user=current_user)
    if confirm_title != space.title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The title does not match")
    space_content_crud.delete_tests_forever(db, test_ids=space_content_crud.list_test_ids(db, space_id=space.id))
    space_crud.delete(db, space=space)
    db.commit()


def regenerate_join_code(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    """The old code stops working at once."""
    space = get_course_or_404(db, space_id=space_id)
    require_owner(db, space=space, user=current_user)
    require_active(space)
    space.join_code = _new_join_code(db)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def duplicate_course(db: Session, *, space_id: str, current_user: User, data: SpaceDuplicateRequest) -> SpaceDetail:
    """Copy the PUBLISHED content into a new course owned by the current user, in edit mode.

    No members, drafts, results or progress are copied. The copied content is draft content
    (`is_draft = true`), as if the author made it in edit mode: nothing is visible until publish.
    """
    source = get_course_or_404(db, space_id=space_id)
    require_author(db, space=source, user=current_user)

    copy = space_crud.create(
        db,
        kind=int(SpaceKind.COURSE),
        owner_id=current_user.id,
        title=data.title,
        description=data.description,
        tags=data.tags,
        visibility=int(SpaceVisibility.PRIVATE),
        join_code=_new_join_code(db),
        draft_started_at=now(),
    )
    items = space_item_crud.list_by_space(db, space_id=source.id, is_draft=False)
    links = space_item_test_crud.list_by_items(db, item_ids=[i.id for i in items])
    notes = {n.id: n for n in space_content_crud.list_notes(db, ids=[i.note_id for i in items if i.note_id])}

    for section in space_section_crud.list_by_space(db, space_id=source.id, is_draft=False):
        new_section = space_section_crud.create(
            db, space_id=copy.id, title=section.title, position=section.position, is_draft=True
        )
        for item in (i for i in items if i.section_id == section.id):
            note_id, test_ids = _copy_item_content(
                db, item=item, notes=notes, variants=links.get(item.id, []), space=copy, user=current_user
            )
            space_item_crud.create(
                db,
                space_id=copy.id,
                section_id=new_section.id,
                kind=item.kind,
                position=item.position,
                is_draft=True,
                note_id=note_id,
                test_ids=test_ids,
                policy_from=item,
            )
    db.commit()
    return build_detail(db, space=copy, current_user=current_user)


def _copy_item_content(
    db: Session, *, item: SpaceItem, notes: dict[str, Note], variants: Sequence[str], space: Space, user: User
) -> tuple[str | None, list[str]]:
    """Copy the content of one published item into `space` as draft content. Returns (note_id, test ids).

    A TEST item copies every variant, in order.
    """
    if item.note_id is not None:
        source_note = notes[item.note_id]
        new_note = note_crud.create(
            db,
            user_id=user.id,
            title=source_note.title,
            content=source_note.content,
            tags=list(source_note.tags),
            space_id=space.id,
            is_draft=True,
        )
        return new_note.id, []
    new_ids: list[str] = []
    for test_id in variants:
        source_test = test_crud.get_by_id(db, id=test_id)
        if source_test is None:
            raise conflict("A test of this course no longer exists")
        new_test, _ = clone_test(
            db,
            test=source_test,
            user_id=user.id,
            parent_id=None,
            space_id=space.id,
            source_note_id=None,
            link_origin=False,
            is_draft=True,
        )
        new_ids.append(new_test.id)
    return None, new_ids


# ── Lists ─────────────────────────────────────────────────────────────────────


def list_my_courses(
    db: Session,
    *,
    current_user: User,
    list_status: SpaceListStatus = "active",
    visibility: Sequence[SpaceVisibility] = (),
    roles: Sequence[SpaceRole] = (),
) -> list[SpaceSummary]:
    spaces = space_crud.list_for_user(
        db, user_id=current_user.id, status=list_status, visibility=visibility, roles=roles
    )
    return build_summaries(db, spaces=spaces, current_user=current_user)


def list_invitations(db: Session, *, current_user: User) -> list[SpaceSummary]:
    spaces = space_crud.list_with_member_status(db, user_id=current_user.id, member_status=MemberStatus.INVITED)
    return build_summaries(db, spaces=spaces, current_user=current_user)


def list_catalog(
    db: Session, *, current_user: User, search: str | None, sort: SpaceCatalogSort, page: int, per_page: int
) -> tuple[list[SpaceSummary], int]:
    spaces, total = space_crud.list_catalog(db, search=search, sort=sort, page=page, per_page=per_page)
    return build_summaries(db, spaces=spaces, current_user=current_user), total
