"""Edit mode and publish for a course or a classroom (see docs/spaces.md, "Draft engine").

A classroom has the same engine for its classwork. Its COURSE items point to a course
(`child_space_id`). The course publishes on its own. A course that no item points to any more is
deleted (`_sweep_orphan_courses`).

- Enter edit mode: the published structure (sections + items) is cloned as draft rows
  (`draft_of_id` → the published row). Draft items point to the PUBLISHED content.
- Content twins are lazy: the first edit of a published note or test (`make_editable`) clones
  it as a draft twin (`draft_of_id` → the published row). New content is a draft without a twin target.
- Publish diffs by `draft_of_id`: twin = update in place (same id), no target = add, a published
  row without a draft = remove. Discard deletes every draft row.

Every write here locks the space row (SELECT … FOR UPDATE), so two authors can not publish, or
make two twins of one note, at the same time.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import NotificationType, SpaceItemKind, SpaceKind
from app.crud import note as note_crud
from app.crud import space as space_crud
from app.crud import space_attempt as space_attempt_crud
from app.crud import space_content as space_content_crud
from app.crud import space_item as space_item_crud
from app.crud import space_item_completion as space_item_completion_crud
from app.crud import space_item_test as space_item_test_crud
from app.crud import space_member as space_member_crud
from app.crud import space_publish as space_publish_crud
from app.crud import space_section as space_section_crud
from app.crud import test as test_crud
from app.models.note import Note
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_section import SpaceSection
from app.models.test import Test
from app.models.user import User
from app.schemas.notification import ContentPublishedPayload
from app.schemas.space import (
    SpaceDetail,
    SpaceDraftOrder,
    SpaceItemContent,
    SpaceItemCopy,
    SpaceItemCreate,
    SpaceItemUpdate,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceSectionUpdate,
    SpaceVariantCreate,
    SpaceVariantOrder,
)
from app.services import note_service, notification_service, space_progress_service
from app.services.access_service import AccessLevel, get_note_or_404, get_test_or_404, require_personal
from app.services.space_changes_service import has_unpublished_changes, test_changed
from app.services.space_service import (
    build_detail,
    conflict,
    delete_spaces_forever,
    get_space_or_404,
    now,
    require_active,
    require_author,
)
from app.services.versioning_service import clone_test, version_test_if_needed

# The frontend shows this text as it is.
ORPHAN_HAS_RESULTS = "A removed course has student results. Delete the course forever first."


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _lock_for_authoring(db: Session, *, space_id: str, current_user: User) -> Space:
    """Lock the space. OWNER / EDITOR, ACTIVE space."""
    space = get_space_or_404(db, space_id=space_id, for_update=True)
    require_author(db, space=space, user=current_user)
    require_active(db, space)
    return space


def lock_editing(db: Session, *, space_id: str, current_user: User) -> Space:
    """`_lock_for_authoring` + edit mode must be on."""
    space = _lock_for_authoring(db, space_id=space_id, current_user=current_user)
    if space.draft_started_at is None:
        raise conflict("Edit mode is off")
    return space


def _get_draft_section_or_404(db: Session, *, space: Space, section_id: str) -> SpaceSection:
    section = space_section_crud.get_draft(db, space_id=space.id, section_id=section_id)
    if section is None:
        raise _not_found("Section not found")
    return section


def _get_draft_item_or_404(db: Session, *, space: Space, item_id: str) -> SpaceItem:
    item = space_item_crud.get_draft(db, space_id=space.id, item_id=item_id)
    if item is None:
        raise _not_found("Item not found")
    return item


def _sweep_orphan_courses(db: Session, *, space: Space) -> None:
    """Delete the courses of a classroom that no COURSE item (draft or published) points to.

    Such a course comes from a discarded or deleted draft item, or from a published item removed by a
    publish. Without this, students would still reach the course through the classroom.

    A course with student data (a result or an attempt of a user who is not a teacher) is never swept:
    the whole operation fails with 409 and nothing changes. The owner deletes such a course on purpose
    with "Delete forever" (`space_service.delete_course_forever`).
    """
    if space.kind != int(SpaceKind.CLASSROOM):
        return
    linked = [i.child_space_id for i in space_item_crud.list_course_items(db, space_id=space.id) if i.child_space_id]
    orphans = space_crud.list_orphan_children(db, parent_id=space.id, linked_ids=linked)
    if not orphans:
        return
    teachers = {
        space.owner_id,
        *(s.owner_id for s in orphans),
        *(uid for s in (space, *orphans) for uid in space_member_crud.list_active_editor_ids(db, space_id=s.id)),
    }
    if space_content_crud.has_member_data(db, space_ids=[s.id for s in orphans], excluded_user_ids=list(teachers)):
        # The caller wrote draft rows before this check. Roll them back: a refused call changes nothing.
        db.rollback()
        raise conflict(ORPHAN_HAS_RESULTS)
    delete_spaces_forever(db, spaces=orphans)


def _delete_draft_content(db: Session, *, space_id: str) -> None:
    """Delete every draft note and draft test of the space (new content and twins)."""
    space_content_crud.delete_notes(db, ids=space_content_crud.list_draft_note_ids(db, space_id=space_id))
    space_content_crud.delete_tests_forever(db, test_ids=space_content_crud.list_draft_test_ids(db, space_id=space_id))


# ── Edit mode ─────────────────────────────────────────────────────────────────


def enter_edit_mode(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    """Clone the published structure as draft rows. A repeated call changes nothing."""
    space = _lock_for_authoring(db, space_id=space_id, current_user=current_user)
    if space.draft_started_at is None:
        items = space_item_crud.list_by_space(db, space_id=space.id, is_draft=False)
        links = space_item_test_crud.list_by_items(db, item_ids=[i.id for i in items])
        for section in space_section_crud.list_by_space(db, space_id=space.id, is_draft=False):
            draft_section = space_section_crud.create(
                db,
                space_id=space.id,
                title=section.title,
                position=section.position,
                is_draft=True,
                draft_of_id=section.id,
            )
            for item in (i for i in items if i.section_id == section.id):
                space_item_crud.create(
                    db,
                    space_id=space.id,
                    section_id=draft_section.id,
                    kind=item.kind,
                    position=item.position,
                    is_draft=True,
                    note_id=item.note_id,
                    test_ids=links.get(item.id, []),
                    child_space_id=item.child_space_id,
                    draft_of_id=item.id,
                    policy_from=item,
                )
        space.draft_started_at = now()
        db.commit()
    return build_detail(db, space=space, current_user=current_user)


def discard(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    """Delete all draft rows and draft content. The published state stays as it was."""
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    _delete_draft_content(db, space_id=space.id)
    space_section_crud.delete_drafts(db, space_id=space.id)
    _sweep_orphan_courses(db, space=space)
    space.draft_started_at = None
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


# ── Structure ─────────────────────────────────────────────────────────────────


def add_section(db: Session, *, space_id: str, current_user: User, data: SpaceSectionCreate) -> SpaceDetail:
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    position = len(space_section_crud.list_by_space(db, space_id=space.id, is_draft=True))
    space_section_crud.create(db, space_id=space.id, title=data.title, position=position, is_draft=True)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def rename_section(
    db: Session, *, space_id: str, section_id: str, current_user: User, data: SpaceSectionUpdate
) -> SpaceDetail:
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    section = _get_draft_section_or_404(db, space=space, section_id=section_id)
    section.title = data.title
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def delete_section(db: Session, *, space_id: str, section_id: str, current_user: User) -> SpaceDetail:
    """The draft items go with the DB cascade. Their content is cleaned up on publish or discard."""
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    section = _get_draft_section_or_404(db, space=space, section_id=section_id)
    space_section_crud.delete(db, section=section)
    _sweep_orphan_courses(db, space=space)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def delete_item(db: Session, *, space_id: str, item_id: str, current_user: User) -> SpaceDetail:
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_item_or_404(db, space=space, item_id=item_id)
    space_item_crud.delete(db, item=item)
    _sweep_orphan_courses(db, space=space)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def reorder(db: Session, *, space_id: str, current_user: User, data: SpaceDraftOrder) -> SpaceDetail:
    """Set the full order of the draft structure. Items can move between sections.

    The body must list every draft section once and every draft item once (400 otherwise),
    so a stale client can not lose an item.
    """
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    sections = {s.id: s for s in space_section_crud.list_by_space(db, space_id=space.id, is_draft=True)}
    items = {i.id: i for i in space_item_crud.list_by_space(db, space_id=space.id, is_draft=True)}
    sent_sections = [s.id for s in data.sections]
    sent_items = [item_id for s in data.sections for item_id in s.item_ids]
    if sorted(sent_sections) != sorted(sections) or sorted(sent_items) != sorted(items):
        raise _bad_request("The order must list every section and item of the draft exactly once")

    for section_position, entry in enumerate(data.sections):
        sections[entry.id].position = section_position
        for item_position, item_id in enumerate(entry.item_ids):
            items[item_id].section_id = entry.id
            items[item_id].position = item_position
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


# ── Content ───────────────────────────────────────────────────────────────────


def _add_item(db: Session, *, space: Space, section: SpaceSection, note: Note | None, test: Test | None) -> None:
    space_item_crud.create(
        db,
        space_id=space.id,
        section_id=section.id,
        kind=int(SpaceItemKind.NOTE if note is not None else SpaceItemKind.TEST),
        position=space_item_crud.next_position(db, section_id=section.id),
        is_draft=True,
        note_id=note.id if note is not None else None,
        test_ids=[test.id] if test is not None else [],
    )


def create_item(db: Session, *, space_id: str, current_user: User, data: SpaceItemCreate) -> SpaceItemContent:
    """A new, empty note or test (draft content) at the end of a draft section."""
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    section = _get_draft_section_or_404(db, space=space, section_id=data.section_id)
    note = test = None
    if data.kind == SpaceItemKind.NOTE:
        note = note_crud.create(db, user_id=current_user.id, title=data.title, space_id=space.id, is_draft=True)
    else:
        test = test_crud.create(
            db, user_id=current_user.id, title=data.title, description=None, space_id=space.id, is_draft=True
        )
    _add_item(db, space=space, section=section, note=note, test=test)
    db.commit()
    return SpaceItemContent(note_id=note.id if note else None, test_id=test.id if test else None)


def copy_item(db: Session, *, space_id: str, current_user: User, data: SpaceItemCopy) -> SpaceItemContent:
    """Copy a personal, live note or test of the user into a draft section.

    The copy is new content with no link to the source (no `source_note_id`, no `origin_id`):
    later edits on either side do not reach the other.
    """
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    section = _get_draft_section_or_404(db, space=space, section_id=data.section_id)
    note = test = None
    if data.note_id is not None:
        source_note = get_note_or_404(db, note_id=data.note_id, current_user=current_user, level=AccessLevel.READ)
        require_personal(space_id=source_note.space_id)
        if source_note.deleted_at is not None:
            raise _not_found("Note not found")
        note = note_crud.create(
            db,
            user_id=current_user.id,
            title=source_note.title,
            content=source_note.content,
            tags=list(source_note.tags),
            space_id=space.id,
            is_draft=True,
        )
    else:
        source_test = get_test_or_404(db, test_id=data.test_id or "", current_user=current_user, level=AccessLevel.READ)
        require_personal(space_id=source_test.space_id)
        test, _ = clone_test(
            db,
            test=source_test,
            user_id=current_user.id,
            parent_id=None,
            space_id=space.id,
            source_note_id=None,
            link_origin=False,
            is_draft=True,
        )
    _add_item(db, space=space, section=section, note=note, test=test)
    db.commit()
    return SpaceItemContent(note_id=note.id if note else None, test_id=test.id if test else None)


def make_editable(
    db: Session, *, space_id: str, item_id: str, current_user: User, test_id: str | None = None
) -> SpaceItemContent:
    """The id of the row the author edits for a draft item.

    New content is already a draft: its own id. Published content: its draft twin, made now on
    the first edit (a later call returns the same twin). A TEST item has one row per variant:
    `test_id` picks the variant (default: the first one).
    """
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_item_or_404(db, space=space, item_id=item_id)
    if item.note_id is not None:
        note_id = _editable_note_id(db, note_id=item.note_id, user=current_user)
        content = SpaceItemContent(note_id=note_id, test_id=None)
    else:
        variants = _variant_ids(db, item=item)
        if test_id is not None and test_id not in variants:
            raise _not_found("Test not found")
        content = SpaceItemContent(
            note_id=None, test_id=_editable_test_id(db, test_id=test_id or variants[0], user=current_user)
        )
    db.commit()
    return content


def _variant_ids(db: Session, *, item: SpaceItem) -> list[str]:
    """The linked tests of a TEST item, in order. A TEST item always has at least one."""
    variants = space_item_test_crud.list_by_items(db, item_ids=[item.id]).get(item.id, [])
    if not variants:
        raise _not_found("Test not found")
    return variants


def _editable_note_id(db: Session, *, note_id: str, user: User) -> str:
    notes = space_content_crud.list_notes(db, ids=[note_id])
    if not notes:
        raise _not_found("Note not found")
    published = notes[0]
    if published.is_draft:
        return published.id
    twins = space_content_crud.list_note_twins(db, published_ids=[published.id])
    if twins:
        return twins[0].id
    twin = note_crud.create(
        db,
        user_id=user.id,
        title=published.title,
        content=published.content,
        tags=list(published.tags),
        space_id=published.space_id,
        is_draft=True,
        draft_of_id=published.id,
    )
    return twin.id


def _editable_test_id(db: Session, *, test_id: str, user: User) -> str:
    published = test_crud.get_by_id(db, id=test_id)
    if published is None:
        raise _not_found("Test not found")
    if published.is_draft:
        return published.id
    twins = space_content_crud.list_test_twins(db, published_ids=[published.id])
    if twins:
        return twins[0].id
    twin, _ = clone_test(
        db,
        test=published,
        user_id=user.id,
        parent_id=None,
        space_id=published.space_id,
        source_note_id=published.source_note_id,
        link_origin=False,
        is_draft=True,
        draft_of_id=published.id,
    )
    return twin.id


# ── Attempt policy and variants (TEST items) ─────────────────────────────────


def _get_draft_test_item_or_404(db: Session, *, space: Space, item_id: str) -> SpaceItem:
    item = _get_draft_item_or_404(db, space=space, item_id=item_id)
    if item.kind != int(SpaceItemKind.TEST):
        raise _bad_request("Only a test item has an attempt policy and variants")
    return item


# Only TEST items have these.
_TEST_ONLY_FIELDS = frozenset(
    {
        "pass_threshold",
        "max_attempts",
        "cooldown_hours",
        "reveal_answers",
        "time_limit_minutes",
        "opens_at",
        "closes_at",
    }
)


def update_item(db: Session, *, space_id: str, item_id: str, current_user: User, data: SpaceItemUpdate) -> SpaceDetail:
    """Edit the schedule of a draft item, and the attempt policy and test window of a draft TEST item.

    Only the sent fields change.
    """
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_item_or_404(db, space=space, item_id=item_id)
    if item.kind != int(SpaceItemKind.TEST) and data.model_fields_set & _TEST_ONLY_FIELDS:
        raise _bad_request("Only a test item has an attempt policy and a test window")
    sent = data.model_fields_set
    # Check the window with the stored value for a field that was not sent, before any change.
    opens_at = data.opens_at if "opens_at" in sent else item.opens_at
    closes_at = data.closes_at if "closes_at" in sent else item.closes_at
    if opens_at is not None and closes_at is not None and closes_at <= opens_at:
        raise _bad_request("closesAt must be after opensAt")
    # `model_fields_set`: a sent null on `max_attempts` means "unlimited", an omitted field means "keep".
    for field in sent:
        value = getattr(data, field)
        setattr(item, field, int(value) if field == "reveal_answers" else value)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def add_variant(
    db: Session, *, space_id: str, item_id: str, current_user: User, data: SpaceVariantCreate
) -> SpaceItemContent:
    """Add a new empty test, or a copy of a personal test, as the last variant of a draft TEST item."""
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_test_item_or_404(db, space=space, item_id=item_id)
    if data.title is not None:
        test = test_crud.create(
            db, user_id=current_user.id, title=data.title, description=None, space_id=space.id, is_draft=True
        )
    else:
        source = get_test_or_404(db, test_id=data.test_id or "", current_user=current_user, level=AccessLevel.READ)
        require_personal(space_id=source.space_id)
        test, _ = clone_test(
            db,
            test=source,
            user_id=current_user.id,
            parent_id=None,
            space_id=space.id,
            source_note_id=None,
            link_origin=False,
            is_draft=True,
        )
    variants = space_item_test_crud.list_by_items(db, item_ids=[item.id]).get(item.id, [])
    space_item_test_crud.replace(db, item_id=item.id, test_ids=[*variants, test.id])
    db.commit()
    return SpaceItemContent(note_id=None, test_id=test.id)


def remove_variant(db: Session, *, space_id: str, item_id: str, test_id: str, current_user: User) -> SpaceDetail:
    """Unlink a variant. The last one can not go (an item needs 1+). Its content is cleaned up on publish."""
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_test_item_or_404(db, space=space, item_id=item_id)
    variants = _variant_ids(db, item=item)
    if test_id not in variants:
        raise _not_found("Test not found")
    if len(variants) == 1:
        raise _bad_request("A test item needs at least one test")
    # A new draft variant has no other user: delete it now. A published one stays until publish.
    removed = test_crud.get_by_id(db, id=test_id)
    space_item_test_crud.replace(db, item_id=item.id, test_ids=[v for v in variants if v != test_id])
    if removed is not None and removed.is_draft and removed.draft_of_id is None:
        space_content_crud.delete_tests_forever(db, test_ids=[removed.id])
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def reorder_variants(
    db: Session, *, space_id: str, item_id: str, current_user: User, data: SpaceVariantOrder
) -> SpaceDetail:
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_test_item_or_404(db, space=space, item_id=item_id)
    variants = _variant_ids(db, item=item)
    if sorted(data.test_ids) != sorted(variants):
        raise _bad_request("The order must list every test of the item exactly once")
    space_item_test_crud.replace(db, item_id=item.id, test_ids=data.test_ids)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


# ── Publish ───────────────────────────────────────────────────────────────────


def _publish_sections(db: Session, *, space: Space) -> tuple[dict[str, str], list[str]]:
    """Update twin sections in place, insert new ones.

    Returns ({draft section id: published section id}, ids of the published sections to remove).
    """
    published = {s.id: s for s in space_section_crud.list_by_space(db, space_id=space.id, is_draft=False)}
    section_map: dict[str, str] = {}
    for draft in space_section_crud.list_by_space(db, space_id=space.id, is_draft=True):
        target = published.get(draft.draft_of_id or "")
        if target is None:
            target = space_section_crud.create(
                db, space_id=space.id, title=draft.title, position=draft.position, is_draft=False
            )
        else:
            target.title = draft.title
            target.position = draft.position
        section_map[draft.id] = target.id
    kept = set(section_map.values())
    return section_map, [section_id for section_id in published if section_id not in kept]


@dataclass(frozen=True)
class _ItemsPublished:
    item_map: dict[str, str]  # {draft item id: published item id}
    removed_items: list[SpaceItem]
    # Tests that no item links any more: the variants of removed items, and variants unlinked from kept items.
    removed_test_ids: list[str]
    # (published item id, test id) of the variants unlinked from kept items (their OPEN attempts expire).
    unlinked: list[tuple[str, str]]


def _publish_items(
    db: Session, *, space: Space, section_map: dict[str, str], drafts: Sequence[SpaceItem]
) -> _ItemsPublished:
    """Update twin items in place (section, position, policy, variant links), insert new ones.

    The links point to stable test ids, so a publish only copies the link sets: the content of a
    changed test is merged by `_publish_tests`.
    """
    published = {i.id: i for i in space_item_crud.list_by_space(db, space_id=space.id, is_draft=False)}
    draft_links = space_item_test_crud.list_by_items(db, item_ids=[d.id for d in drafts])
    live_links = space_item_test_crud.list_by_items(db, item_ids=list(published))
    item_map: dict[str, str] = {}
    unlinked: list[tuple[str, str]] = []
    for draft in drafts:
        target = published.get(draft.draft_of_id or "")
        variants = draft_links.get(draft.id, [])
        if target is None:
            target = space_item_crud.create(
                db,
                space_id=space.id,
                section_id=section_map[draft.section_id],
                kind=draft.kind,
                position=draft.position,
                is_draft=False,
                note_id=draft.note_id,
                test_ids=variants,
                child_space_id=draft.child_space_id,
                policy_from=draft,
            )
        else:
            target.section_id = section_map[draft.section_id]
            target.position = draft.position
            space_item_crud.copy_policy(source=draft, target=target)
            old = live_links.get(target.id, [])
            if old != variants:
                space_item_test_crud.replace(db, item_id=target.id, test_ids=variants)
            unlinked += [(target.id, t) for t in old if t not in variants]
        item_map[draft.id] = target.id
    kept = set(item_map.values())
    removed = [item for item_id, item in published.items() if item_id not in kept]
    removed_test_ids = [t for item in removed for t in live_links.get(item.id, [])] + [t for _, t in unlinked]
    return _ItemsPublished(item_map, removed, removed_test_ids, unlinked)


def _publish_notes(db: Session, *, note_ids: list[str]) -> list[str]:
    """New draft notes become published. A twin is copied into its published note (same id).

    Returns the ids of the notes that are new or changed: they need new embeddings (`is_indexed = False`).
    A twin with the same content as its note (the editor opened it, nothing changed) is not re-indexed.
    """
    notes = {n.id: n for n in space_content_crud.list_notes(db, ids=note_ids)}
    to_index: list[str] = []
    for note in notes.values():
        if note.is_draft:
            note.is_draft = False
            note.is_indexed = False
            to_index.append(note.id)
    for twin in space_content_crud.list_note_twins(db, published_ids=note_ids):
        target = notes[twin.draft_of_id or ""]
        if (target.title, target.content, list(target.tags)) == (twin.title, twin.content, list(twin.tags)):
            continue
        target.title = twin.title
        target.content = twin.content
        target.tags = list(twin.tags)
        target.version += 1
        target.is_indexed = False
        to_index.append(target.id)
    db.flush()
    return to_index


def _publish_tests(db: Session, *, test_ids: list[str]) -> None:
    """New draft tests become published. A changed twin replaces the questions of its published test (same id).

    Every changed test gets a frozen snapshot first (`force`: also with no results), and `version`
    goes up by 1. An open attempt is graded against the snapshot of the version it started on.
    A twin that has the same content as its test (the editor opened it, nothing changed) is skipped.
    """
    for test in space_content_crud.list_tests(db, ids=test_ids):
        if test.is_draft:
            test.is_draft = False
    db.flush()
    twins = space_content_crud.list_test_twins(db, published_ids=test_ids, active_children=True)
    published = {
        t.id: t
        for t in space_content_crud.list_tests(db, ids=[t.draft_of_id or "" for t in twins], active_children=True)
    }
    for twin in twins:
        target = published.get(twin.draft_of_id or "")
        if target is None or not test_changed(twin, target):
            continue
        version_test_if_needed(db, test=target, force=True)
        space_content_crud.retire_test_children(db, test_id=target.id)
        space_content_crud.move_test_children(db, from_test_id=twin.id, to_test_id=target.id)
        target.title = twin.title
        target.description = twin.description
    db.flush()


def _remove_published_content(db: Session, *, removed: Sequence[SpaceItem], removed_test_ids: Sequence[str]) -> None:
    """Notes are deleted (the DB cascade removes their twins). Tests are soft-deleted after a
    version freeze, so members' results keep their questions (same as deleting a personal test)."""
    space_content_crud.delete_notes(db, ids=[i.note_id for i in removed if i.note_id])
    for test in space_content_crud.list_tests(db, ids=removed_test_ids):
        version_test_if_needed(db, test=test)
        test_crud.delete(db, test=test)


def _notify_content_published(db: Session, *, space: Space, current_user: User, message: str | None) -> None:
    """ACTIVE students only. A classroom course is skipped while its students can not see it yet (no
    published COURSE item pointing at it, or a `visible_from` still in the future) -- notifying them
    would link to something that 404s for them."""
    classroom: Space | None
    if space.kind == int(SpaceKind.CLASSROOM):
        classroom = space
    elif space.parent_id is not None:
        if space_item_crud.is_course_hidden(db, course_id=space.id):
            return
        classroom = space_crud.get_by_id(db, id=space.parent_id)
        if classroom is None:
            return
    else:
        classroom = None

    students_of = classroom or space
    student_ids = {user.id for _member, user in space_member_crud.list_active_students(db, space_id=students_of.id)}
    if not student_ids:
        return
    notification_service.notify(
        db,
        notification_type=NotificationType.CONTENT_PUBLISHED,
        recipients=student_ids,
        actor_id=current_user.id,
        space_id=space.id,
        payload=ContentPublishedPayload(
            space_id=space.id,
            space_title=space.title,
            classroom_id=classroom.id if classroom is not None else None,
            classroom_title=classroom.title if classroom is not None else None,
            message=message,
        ),
    )


def publish(
    db: Session,
    *,
    space_id: str,
    current_user: User,
    data: SpacePublishRequest,
    background_tasks: BackgroundTasks | None = None,
) -> SpaceDetail:
    """Apply the draft to the published state, then leave edit mode.

    The new and changed notes are embedded after the response (`background_tasks`), so members can find
    them with the Assistant. A draft is never indexed.
    """
    space = lock_editing(db, space_id=space_id, current_user=current_user)
    # An autosave that comes during the publish waits, then gets 404: its twin is gone. Without the
    # lock, publish could copy the older content and then delete the newer one.
    space_content_crud.lock_draft_content(db, space_id=space.id)
    if not has_unpublished_changes(db, space=space):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nothing to publish")
    draft_items = space_item_crud.list_by_space(db, space_id=space.id, is_draft=True)
    draft_links = space_item_test_crud.list_by_items(db, item_ids=[i.id for i in draft_items])

    section_map, removed_section_ids = _publish_sections(db, space=space)
    items = _publish_items(db, space=space, section_map=section_map, drafts=draft_items)
    # A removed variant can not be submitted: close its open attempts (they count as started).
    at = now()
    for item_id, test_id in items.unlinked:
        space_attempt_crud.expire_open_for_variants(db, item_id=item_id, test_ids=[test_id], finished_at=at)
    notes_to_index = _publish_notes(db, note_ids=[i.note_id for i in draft_items if i.note_id])
    _publish_tests(db, test_ids=[t for tests in draft_links.values() for t in tests])
    _remove_published_content(db, removed=items.removed_items, removed_test_ids=items.removed_test_ids)

    # Everything still a draft now is unused: twins (merged above) and content of deleted items.
    _delete_draft_content(db, space_id=space.id)
    space_section_crud.delete_drafts(db, space_id=space.id)
    space_item_crud.delete_by_ids(db, ids=[i.id for i in items.removed_items])
    space_section_crud.delete_by_ids(db, ids=removed_section_ids)
    _sweep_orphan_courses(db, space=space)

    # Stored as published item ids: draft ids are gone after this call. Unknown ids are ignored.
    reset_item_ids = [items.item_map[i] for i in data.reset_item_ids if i in items.item_map]
    space_publish_crud.create(
        db,
        space_id=space.id,
        published_by=current_user.id,
        message=data.message,
        notify_members=data.notify_members,
        reset_item_ids=reset_item_ids,
    )
    # Lock order of the progress writes: member rows first, then completion rows (see
    # `space_progress_service.recheck_test_completion`). Sorted, so two publishes can not deadlock.
    space_member_crud.lock_rows(
        db, space_id=space.id, user_ids=space_item_completion_crud.list_user_ids_for_items(db, item_ids=reset_item_ids)
    )
    space_item_completion_crud.remove_for_items(db, item_ids=reset_item_ids)
    # Old results and attempts stop counting: without this the next recheck finds the old best score.
    space_item_crud.set_progress_reset(db, item_ids=reset_item_ids, at=at)
    space_progress_service.sync_course_completion(db, space_id=space.id)
    space.published_at = now()
    space.draft_started_at = None
    if data.notify_members:
        _notify_content_published(db, space=space, current_user=current_user, message=data.message)
    db.commit()
    if background_tasks is not None:
        for note_id in notes_to_index:
            background_tasks.add_task(note_service.schedule_indexing, note_id)
    return build_detail(db, space=space, current_user=current_user)
