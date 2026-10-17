"""Does the draft of a course differ from its published version? (Publish is allowed only then.)

A separate module: `space_service.build_detail` and `space_draft_service.publish` both use it,
and `space_draft_service` already imports `space_service`.

The editor makes a content twin when it opens a published note or test, before any change.
So a twin alone is not a change: its content is compared with the published row.
"""

import json
from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.crud import space_content as space_content_crud
from app.crud import space_item as space_item_crud
from app.crud import space_section as space_section_crud
from app.models.note import Note
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.space_section import SpaceSection
from app.models.test import Test

# One section in order: (published section id, title, [published item ids in order]).
_Structure = list[tuple[str | None, str, list[str | None]]]


def has_unpublished_changes(db: Session, *, space: Space) -> bool:
    """True when publish would change what members see. A course that was never published: always True."""
    if space.draft_started_at is None:
        return False
    if space.published_at is None:
        return True
    draft_items = space_item_crud.list_by_space(db, space_id=space.id, is_draft=True)
    published_items = space_item_crud.list_by_space(db, space_id=space.id, is_draft=False)
    draft_structure = _structure(
        space_section_crud.list_by_space(db, space_id=space.id, is_draft=True), draft_items, as_published=True
    )
    published_structure = _structure(
        space_section_crud.list_by_space(db, space_id=space.id, is_draft=False), published_items, as_published=False
    )
    if draft_structure != published_structure:
        return True
    return _notes_changed(db, items=draft_items) or _tests_changed(db, items=draft_items)


def _structure(sections: Sequence[SpaceSection], items: Sequence[SpaceItem], *, as_published: bool) -> _Structure:
    """The order of sections and items, by published id. Positions are compared as an order, not as numbers.

    A new draft row has no published id (`draft_of_id` is NULL), so it never matches.
    """

    def key(row: SpaceSection | SpaceItem) -> str | None:
        return row.draft_of_id if as_published else row.id

    return [
        (key(section), section.title, [key(item) for item in items if item.section_id == section.id])
        for section in sections
    ]


def _notes_changed(db: Session, *, items: Sequence[SpaceItem]) -> bool:
    published_ids = [i.note_id for i in items if i.note_id]
    twins = space_content_crud.list_note_twins(db, published_ids=published_ids)
    if not twins:
        return False
    published = {n.id: n for n in space_content_crud.list_notes(db, ids=[t.draft_of_id or "" for t in twins])}
    return any(_note_key(twin) != _note_key(published[twin.draft_of_id or ""]) for twin in twins)


def _note_key(note: Note) -> tuple[str, str | None, list[str]]:
    return note.title, note.content, list(note.tags)


def _tests_changed(db: Session, *, items: Sequence[SpaceItem]) -> bool:
    published_ids = [i.test_id for i in items if i.test_id]
    # Eager-load the ACTIVE children: `_test_key` reads them (no lazy queries, no DELETED rows).
    twins = space_content_crud.list_test_twins(db, published_ids=published_ids, active_children=True)
    if not twins:
        return False
    published = {
        t.id: t
        for t in space_content_crud.list_tests(db, ids=[t.draft_of_id or "" for t in twins], active_children=True)
    }
    return any(_test_key(twin) != _test_key(published[twin.draft_of_id or ""]) for twin in twins)


def _test_key(test: Test) -> tuple[str, str | None, Sequence[tuple[object, ...]], Sequence[tuple[object, ...]]]:
    """The visible content of a test. Ids are left out: a twin has new ids for the same content.

    The test must have its ACTIVE questions and groups loaded (`active_children=True`).
    """
    groups = sorted(test.question_groups, key=lambda g: (g.order, g.id))
    # Group questions have `group_id` and no `test_id`, so they are read through their group.
    rows = [(None, q) for q in test.questions if q.group_id is None] + [
        (g.order, q) for g in groups for q in g.questions
    ]
    questions = sorted(
        (
            (
                group_order,
                q.order,
                q.question_type,
                q.prompt,
                json.dumps(q.content, sort_keys=True),
                q.hint,
                q.explanation,
                q.points,
            )
            for group_order, q in rows
        ),
        key=lambda row: (row[0] is not None, row[0] or 0, row[1], row[3]),
    )
    return test.title, test.description, [(g.order, g.type, g.title, g.points) for g in groups], questions
