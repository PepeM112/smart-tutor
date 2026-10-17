"""The full permission matrix of `can_access_space_content` (no DB)."""

import itertools

import pytest

from app.core.enums import SpaceRole, SpaceStatus
from app.services.access_service import AccessLevel, can_access_space_content

_ROLES: list[SpaceRole | None] = [None, SpaceRole.VIEWER, SpaceRole.EDITOR, SpaceRole.OWNER]
_EDIT_ROLES = {SpaceRole.EDITOR, SpaceRole.OWNER}


def _expected(role: SpaceRole | None, space_status: SpaceStatus, is_draft: bool, level: AccessLevel) -> bool:
    """The rule written as a table, so the test does not copy the code."""
    if role is None:
        return False
    if level == AccessLevel.READ:
        # A VIEWER sees published rows only. Archived spaces stay readable.
        return role in _EDIT_ROLES or not is_draft
    if level == AccessLevel.AUTHOR:
        # The answer keys: OWNER / EDITOR only, any row, archived too (it only reads).
        return role in _EDIT_ROLES
    # EDIT: only drafts, only OWNER / EDITOR, never in an archived space.
    return role in _EDIT_ROLES and is_draft and space_status == SpaceStatus.ACTIVE


@pytest.mark.parametrize(
    ("role", "space_status", "is_draft", "level"),
    list(itertools.product(_ROLES, list(SpaceStatus), [True, False], list(AccessLevel))),
)
def test_matrix(role: SpaceRole | None, space_status: SpaceStatus, is_draft: bool, level: AccessLevel) -> None:
    result = can_access_space_content(role=role, space_status=space_status, is_draft=is_draft, level=level)
    assert result is _expected(role, space_status, is_draft, level)


class TestKeyCases:
    def test_viewer_reads_published(self) -> None:
        assert can_access_space_content(
            role=SpaceRole.VIEWER, space_status=SpaceStatus.ACTIVE, is_draft=False, level=AccessLevel.READ
        )

    def test_viewer_can_not_see_a_draft(self) -> None:
        assert not can_access_space_content(
            role=SpaceRole.VIEWER, space_status=SpaceStatus.ACTIVE, is_draft=True, level=AccessLevel.READ
        )

    def test_owner_can_not_edit_published(self) -> None:
        assert not can_access_space_content(
            role=SpaceRole.OWNER, space_status=SpaceStatus.ACTIVE, is_draft=False, level=AccessLevel.EDIT
        )

    def test_owner_can_not_edit_in_an_archived_space(self) -> None:
        assert not can_access_space_content(
            role=SpaceRole.OWNER, space_status=SpaceStatus.ARCHIVED, is_draft=True, level=AccessLevel.EDIT
        )

    def test_editor_edits_a_draft(self) -> None:
        assert can_access_space_content(
            role=SpaceRole.EDITOR, space_status=SpaceStatus.ACTIVE, is_draft=True, level=AccessLevel.EDIT
        )
