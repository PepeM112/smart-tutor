"""One access layer for notes, tests and questions (see docs/spaces.md).

- Personal content (`space_id IS NULL`): only the owner (`user_id`) has access, as before.
- Space content: the role of the user in the space, or in its parent classroom, decides.
  `user_id` on space content only records who created the row.

A missing row gives 404. A row the user can not access gives 403.
"""

from collections.abc import Callable
from dataclasses import dataclass
from enum import IntEnum

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import SpaceKind, SpaceRole, SpaceStatus
from app.crud import note as note_crud
from app.crud import question as question_crud
from app.crud import space as space_crud
from app.crud import space_item as space_item_crud
from app.crud import space_member as space_member_crud
from app.crud import test as test_crud
from app.models.note import Note
from app.models.question import Question
from app.models.space import Space
from app.models.space_item import SpaceItem
from app.models.test import Test
from app.models.test_result import TestResult
from app.models.user import User


class AccessLevel(IntEnum):
    READ = 1
    EDIT = 2
    # Read the full content of space content, answer keys included: OWNER / EDITOR only.
    # Members read tests through `/exam` (no answers), so READ alone must not show the answers.
    AUTHOR = 3


EDIT_ROLES = frozenset({SpaceRole.OWNER, SpaceRole.EDITOR})


@dataclass(frozen=True)
class SpaceAccess:
    role: SpaceRole | None
    # ARCHIVED when the space OR its parent classroom is archived: archived is read-only for all users.
    status: SpaceStatus


def _resolve_role(db: Session, *, chain: list[Space], user_id: str) -> SpaceRole | None:
    """The role of `user_id` in `chain` (the space first, then its parent).

    The owner of the space or of the parent is OWNER. Otherwise the ACTIVE member row of the
    space itself wins over the row of the parent, so a classroom VIEWER can be an EDITOR of one course.
    A lazy row (`role` NULL) is skipped: the role then comes from the parent row, so a promote or a
    demote in the classroom applies to its courses at once.
    """
    if any(s.owner_id == user_id for s in chain):
        return SpaceRole.OWNER
    roles = space_member_crud.list_active_roles(db, user_id=user_id, space_ids=[s.id for s in chain])
    return next((SpaceRole(roles[s.id]) for s in chain if s.id in roles), None)


def resolve_role(db: Session, *, space: Space, user_id: str) -> SpaceRole | None:
    """The effective role of `user_id` in `space` (its parent classroom included).

    A VIEWER gets no role in a classroom course whose COURSE item is not published or not visible yet (`visible_from`).
    """
    parent = space_crud.get_by_id(db, id=space.parent_id) if space.parent_id else None
    role = _resolve_role(db, chain=[space, parent] if parent else [space], user_id=user_id)
    if role == SpaceRole.VIEWER and parent is not None and space_item_crud.is_course_hidden(db, course_id=space.id):
        return None
    return role


def get_space_access(db: Session, *, space_id: str, user_id: str) -> SpaceAccess:
    """The role of the user and the effective status of the space (two small queries + one for the parent)."""
    space = space_crud.get_by_id(db, id=space_id)
    if space is None:
        return SpaceAccess(role=None, status=SpaceStatus.ARCHIVED)
    parent = space_crud.get_by_id(db, id=space.parent_id) if space.parent_id else None
    archived = space.status == int(SpaceStatus.ARCHIVED) or (
        parent is not None and parent.status == int(SpaceStatus.ARCHIVED)
    )
    return SpaceAccess(
        role=resolve_role(db, space=space, user_id=user_id),
        status=SpaceStatus.ARCHIVED if archived else SpaceStatus.ACTIVE,
    )


def can_access_space_content(
    *, role: SpaceRole | None, space_status: SpaceStatus, is_draft: bool, level: AccessLevel
) -> bool:
    """The permission matrix for one row of space content. Pure function (no DB).

    READ: any role. Drafts only for OWNER / EDITOR.
    AUTHOR: OWNER / EDITOR, any row, also in an archived space (it only reads).
    EDIT: OWNER / EDITOR, on a draft only (published rows change through publish), in an ACTIVE space.
    """
    if role is None:
        return False
    if level == AccessLevel.READ:
        return not is_draft or role in EDIT_ROLES
    if level == AccessLevel.AUTHOR:
        return role in EDIT_ROLES
    return role in EDIT_ROLES and is_draft and space_status == SpaceStatus.ACTIVE


def _can_access_content(
    db: Session,
    *,
    owner_id: str,
    space_id: str | None,
    is_draft: bool,
    current_user: User,
    level: AccessLevel,
    is_hidden: Callable[[], bool],
) -> bool:
    """`is_hidden`: true when the published item of the content is not visible yet (`visible_from`).
    It hides the content from a VIEWER only."""
    if space_id is None:
        return owner_id == current_user.id
    access = get_space_access(db, space_id=space_id, user_id=current_user.id)
    if not can_access_space_content(role=access.role, space_status=access.status, is_draft=is_draft, level=level):
        return False
    return not (access.role == SpaceRole.VIEWER and not is_draft and is_hidden())


def can_access_note(db: Session, *, note: Note, current_user: User, level: AccessLevel) -> bool:
    return _can_access_content(
        db,
        owner_id=note.user_id,
        space_id=note.space_id,
        is_draft=note.is_draft,
        current_user=current_user,
        level=level,
        is_hidden=lambda: space_item_crud.is_note_hidden(db, note_id=note.id),
    )


def can_access_test(db: Session, *, test: Test, current_user: User, level: AccessLevel) -> bool:
    return _can_access_content(
        db,
        owner_id=test.user_id,
        space_id=test.space_id,
        is_draft=test.is_draft,
        current_user=current_user,
        level=level,
        is_hidden=lambda: space_item_crud.is_test_hidden(db, test_id=test.id),
    )


def question_space_id(question: Question) -> str | None:
    """The space of a question: the space of its owning test. None for a bank question or a personal test."""
    test = question.owning_test
    return test.space_id if test is not None else None


def can_access_question(db: Session, *, question: Question, current_user: User, level: AccessLevel) -> bool:
    """A question follows its owning test. A bank question is always personal."""
    test = question.owning_test
    if test is None or test.space_id is None:
        return question.user_id == current_user.id
    return can_access_test(db, test=test, current_user=current_user, level=level)


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _not_found(entity_name: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity_name} not found")


def get_note_or_404(
    db: Session, *, note_id: str, current_user: User, level: AccessLevel, for_update: bool = False
) -> Note:
    """`for_update` locks the row until the transaction ends (SELECT ... FOR UPDATE)."""
    fetch = note_crud.get_by_id_for_update if for_update else note_crud.get_by_id
    note = fetch(db, id=note_id)
    if note is None:
        raise _not_found("Note")
    if not can_access_note(db, note=note, current_user=current_user, level=level):
        raise _forbidden()
    return note


def get_test_or_404(
    db: Session, *, test_id: str, current_user: User, level: AccessLevel, for_update: bool = False
) -> Test:
    """`for_update` locks the row until the transaction ends (SELECT ... FOR UPDATE)."""
    fetch = test_crud.get_by_id_for_update if for_update else test_crud.get_by_id
    test = fetch(db, id=test_id)
    if test is None:
        raise _not_found("Test")
    if not can_access_test(db, test=test, current_user=current_user, level=level):
        raise _forbidden()
    return test


def get_question_or_404(
    db: Session, *, question_id: str, current_user: User, level: AccessLevel, active_only: bool = True
) -> Question:
    """By default a deleted question is missing: it must not be updated, assigned or checked."""
    question = question_crud.get_by_id(db, id=question_id, active_only=active_only)
    if question is None:
        raise _not_found("Question")
    if not can_access_question(db, question=question, current_user=current_user, level=level):
        raise _forbidden()
    return question


def require_personal(*, space_id: str | None) -> None:
    """400 for space content: folders, Trash, favorites and the question bank are personal only."""
    if space_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not available for course or classroom content",
        )


def is_classroom_space(space: Space) -> bool:
    """A classroom, or a course inside one. A standalone course is not."""
    return space.kind == int(SpaceKind.CLASSROOM) or space.parent_id is not None


def result_item_and_space(db: Session, *, result: TestResult) -> tuple[SpaceItem, Space] | None:
    """The item and the space of a course result. None for a personal result or when the item is gone."""
    item = space_item_crud.get(db, item_id=result.space_item_id) if result.space_item_id else None
    space = space_crud.get_by_id(db, id=item.space_id) if item is not None else None
    return (item, space) if item is not None and space is not None else None


def can_review_result(db: Session, *, result: TestResult, current_user: User) -> bool:
    """A teacher (OWNER / EDITOR) of the classroom may read and grade the result of a student of the classroom.

    Only classroom items count. The result of a standalone course stays private to its student.
    """
    found = result_item_and_space(db, result=result)
    if found is None or not is_classroom_space(found[1]):
        return False
    return resolve_role(db, space=found[1], user_id=current_user.id) in EDIT_ROLES
