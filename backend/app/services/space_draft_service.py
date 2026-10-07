"""Edit mode and publish for a course (see docs/spaces.md, "Draft engine").

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

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import SpaceItemKind
from app.crud import note as note_crud
from app.crud import space_content as space_content_crud
from app.crud import space_item as space_item_crud
from app.crud import space_publish as space_publish_crud
from app.crud import space_section as space_section_crud
from app.crud import test as test_crud
from app.models.note import Note
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_section import SpaceSection
from app.models.test import Test
from app.models.user import User
from app.schemas.space import (
    SpaceDetail,
    SpaceDraftOrder,
    SpaceItemContent,
    SpaceItemCopy,
    SpaceItemCreate,
    SpacePublishRequest,
    SpaceSectionCreate,
    SpaceSectionUpdate,
)
from app.services.access_service import AccessLevel, get_note_or_404, get_test_or_404, require_personal
from app.services.space_service import (
    build_detail,
    conflict,
    get_course_or_404,
    now,
    require_active,
    require_author,
)
from app.services.versioning_service import clone_test, version_test_if_needed


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _lock_for_authoring(db: Session, *, space_id: str, current_user: User) -> Space:
    """Lock the course. OWNER / EDITOR, ACTIVE course."""
    space = get_course_or_404(db, space_id=space_id, for_update=True)
    require_author(db, space=space, user=current_user)
    require_active(space)
    return space


def _lock_editing(db: Session, *, space_id: str, current_user: User) -> Space:
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
                    test_id=item.test_id,
                    draft_of_id=item.id,
                )
        space.draft_started_at = now()
        db.commit()
    return build_detail(db, space=space, current_user=current_user)


def discard(db: Session, *, space_id: str, current_user: User) -> SpaceDetail:
    """Delete all draft rows and draft content. The published state stays as it was."""
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
    _delete_draft_content(db, space_id=space.id)
    space_section_crud.delete_drafts(db, space_id=space.id)
    space.draft_started_at = None
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


# ── Structure ─────────────────────────────────────────────────────────────────


def add_section(db: Session, *, space_id: str, current_user: User, data: SpaceSectionCreate) -> SpaceDetail:
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
    position = len(space_section_crud.list_by_space(db, space_id=space.id, is_draft=True))
    space_section_crud.create(db, space_id=space.id, title=data.title, position=position, is_draft=True)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def rename_section(
    db: Session, *, space_id: str, section_id: str, current_user: User, data: SpaceSectionUpdate
) -> SpaceDetail:
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
    section = _get_draft_section_or_404(db, space=space, section_id=section_id)
    section.title = data.title
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def delete_section(db: Session, *, space_id: str, section_id: str, current_user: User) -> SpaceDetail:
    """The draft items go with the DB cascade. Their content is cleaned up on publish or discard."""
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
    section = _get_draft_section_or_404(db, space=space, section_id=section_id)
    space_section_crud.delete(db, section=section)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def delete_item(db: Session, *, space_id: str, item_id: str, current_user: User) -> SpaceDetail:
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_item_or_404(db, space=space, item_id=item_id)
    space_item_crud.delete(db, item=item)
    db.commit()
    return build_detail(db, space=space, current_user=current_user)


def reorder(db: Session, *, space_id: str, current_user: User, data: SpaceDraftOrder) -> SpaceDetail:
    """Set the full order of the draft structure. Items can move between sections.

    The body must list every draft section once and every draft item once (400 otherwise),
    so a stale client can not lose an item.
    """
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
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
        test_id=test.id if test is not None else None,
    )


def create_item(db: Session, *, space_id: str, current_user: User, data: SpaceItemCreate) -> SpaceItemContent:
    """A new, empty note or test (draft content) at the end of a draft section."""
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
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
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
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


def make_editable(db: Session, *, space_id: str, item_id: str, current_user: User) -> SpaceItemContent:
    """The id of the row the author edits for a draft item.

    New content is already a draft: its own id. Published content: its draft twin, made now on
    the first edit (a later call returns the same twin).
    """
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
    item = _get_draft_item_or_404(db, space=space, item_id=item_id)
    if item.note_id is not None:
        note_id = _editable_note_id(db, note_id=item.note_id, user=current_user)
        content = SpaceItemContent(note_id=note_id, test_id=None)
    else:
        test_id = _editable_test_id(db, test_id=item.test_id or "", user=current_user)
        content = SpaceItemContent(note_id=None, test_id=test_id)
    db.commit()
    return content


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


def _publish_items(
    db: Session, *, space: Space, section_map: dict[str, str], drafts: Sequence[SpaceItem]
) -> tuple[dict[str, str], list[SpaceItem]]:
    """Update twin items in place (section + position), insert new ones.

    Returns ({draft item id: published item id}, the published items to remove).
    """
    published = {i.id: i for i in space_item_crud.list_by_space(db, space_id=space.id, is_draft=False)}
    item_map: dict[str, str] = {}
    for draft in drafts:
        target = published.get(draft.draft_of_id or "")
        if target is None:
            target = space_item_crud.create(
                db,
                space_id=space.id,
                section_id=section_map[draft.section_id],
                kind=draft.kind,
                position=draft.position,
                is_draft=False,
                note_id=draft.note_id,
                test_id=draft.test_id,
            )
        else:
            target.section_id = section_map[draft.section_id]
            target.position = draft.position
        item_map[draft.id] = target.id
    kept = set(item_map.values())
    return item_map, [item for item_id, item in published.items() if item_id not in kept]


def _publish_notes(db: Session, *, note_ids: list[str]) -> None:
    """New draft notes become published. A twin is copied into its published note (same id)."""
    notes = {n.id: n for n in space_content_crud.list_notes(db, ids=note_ids)}
    for note in notes.values():
        if note.is_draft:
            note.is_draft = False
            # Not indexed in M2: the space RAG (M3) backfills `is_indexed = false` rows.
            note.is_indexed = False
    for twin in space_content_crud.list_note_twins(db, published_ids=note_ids):
        target = notes[twin.draft_of_id or ""]
        target.title = twin.title
        target.content = twin.content
        target.tags = list(twin.tags)
        target.version += 1
        target.is_indexed = False
    db.flush()


def _publish_tests(db: Session, *, test_ids: list[str]) -> None:
    """New draft tests become published. A twin replaces the questions of its published test (same id).

    `version_test_if_needed` first freezes the old questions for existing results, as a normal edit does.
    """
    for test in space_content_crud.list_tests(db, ids=test_ids):
        if test.is_draft:
            test.is_draft = False
    for twin in space_content_crud.list_test_twins(db, published_ids=test_ids):
        target = test_crud.get_by_id(db, id=twin.draft_of_id or "")
        if target is None:
            continue
        version_test_if_needed(db, test=target)
        space_content_crud.retire_test_children(db, test_id=target.id)
        space_content_crud.move_test_children(db, from_test_id=twin.id, to_test_id=target.id)
        target.title = twin.title
        target.description = twin.description
    db.flush()


def _remove_published_content(db: Session, *, removed: Sequence[SpaceItem]) -> None:
    """Notes are deleted (the DB cascade removes their twins). Tests are soft-deleted after a
    version freeze, so members' results keep their questions (same as deleting a personal test)."""
    space_content_crud.delete_notes(db, ids=[i.note_id for i in removed if i.note_id])
    for test_id in (i.test_id for i in removed if i.test_id):
        test = test_crud.get_by_id(db, id=test_id)
        if test is not None:
            version_test_if_needed(db, test=test)
            test_crud.delete(db, test=test)


def publish(db: Session, *, space_id: str, current_user: User, data: SpacePublishRequest) -> SpaceDetail:
    """Apply the draft to the published state, then leave edit mode."""
    space = _lock_editing(db, space_id=space_id, current_user=current_user)
    draft_items = space_item_crud.list_by_space(db, space_id=space.id, is_draft=True)

    section_map, removed_section_ids = _publish_sections(db, space=space)
    item_map, removed_items = _publish_items(db, space=space, section_map=section_map, drafts=draft_items)
    _publish_notes(db, note_ids=[i.note_id for i in draft_items if i.note_id])
    _publish_tests(db, test_ids=[i.test_id for i in draft_items if i.test_id])
    _remove_published_content(db, removed=removed_items)

    # Everything still a draft now is unused: twins (merged above) and content of deleted items.
    _delete_draft_content(db, space_id=space.id)
    space_section_crud.delete_drafts(db, space_id=space.id)
    space_item_crud.delete_by_ids(db, ids=[i.id for i in removed_items])
    space_section_crud.delete_by_ids(db, ids=removed_section_ids)

    space_publish_crud.create(
        db,
        space_id=space.id,
        published_by=current_user.id,
        message=data.message,
        notify_members=data.notify_members,
        # Stored as published item ids: draft ids are gone after this call. Unknown ids are ignored.
        reset_item_ids=[item_map[i] for i in data.reset_item_ids if i in item_map],
    )
    space.published_at = now()
    space.draft_started_at = None
    db.commit()
    return build_detail(db, space=space, current_user=current_user)
