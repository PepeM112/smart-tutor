"""The Stream feed of a classroom: posts and flat comments (ST-69 M5). See `docs/spaces.md`, "Feed".

v1: plain text only, `space_feed_service` only allows CLASSROOM-kind spaces. `can_edit` / `can_delete`
are computed on the backend (own content, or a teacher for `can_delete`), the same way `can_override`
is computed in `test_result_service.get_result_read` -- a default here, filled with `model_copy(update=...)`.
"""

from datetime import datetime

from pydantic import Field, field_validator

from app.core.constants import COMMENT_BODY_MAX, POST_BODY_MAX
from app.schemas.base import BaseSchema
from app.schemas.pagination import CursorPage


def _clean_body(body: str, *, max_length: int) -> str:
    body = body.strip()
    if not body:
        raise ValueError("Body cannot be empty")
    if len(body) > max_length:
        raise ValueError(f"Body is longer than {max_length} characters")
    return body


class FeedAuthor(BaseSchema):
    """Mirrors the identifying fields of `SpaceMemberRead`. The owner is an author too (no member row)."""

    user_id: str
    username: str
    display_name: str | None


# ── Posts ─────────────────────────────────────────────────────────────────────


class SpacePostCreate(BaseSchema):
    body: str = Field(max_length=POST_BODY_MAX)

    @field_validator("body")
    @classmethod
    def _validate_body(cls, value: str) -> str:
        return _clean_body(value, max_length=POST_BODY_MAX)


class SpacePostUpdate(BaseSchema):
    body: str = Field(max_length=POST_BODY_MAX)

    @field_validator("body")
    @classmethod
    def _validate_body(cls, value: str) -> str:
        return _clean_body(value, max_length=POST_BODY_MAX)


class SpacePostRead(BaseSchema):
    id: str
    space_id: str
    author: FeedAuthor
    body: str
    can_edit: bool = False
    can_delete: bool = False
    comments: list["SpaceCommentRead"] = []
    created_at: datetime
    updated_at: datetime


class SpacePostPage(CursorPage[SpacePostRead]):
    """`can_post` / `can_comment` tell the Stream which composers to show. They follow `feed_permission`
    and the archive state, which only the owner can read from the settings endpoint."""

    can_post: bool = False
    can_comment: bool = False


# ── Comments ──────────────────────────────────────────────────────────────────


class SpaceCommentCreate(BaseSchema):
    body: str = Field(max_length=COMMENT_BODY_MAX)

    @field_validator("body")
    @classmethod
    def _validate_body(cls, value: str) -> str:
        return _clean_body(value, max_length=COMMENT_BODY_MAX)


class SpaceCommentUpdate(BaseSchema):
    body: str = Field(max_length=COMMENT_BODY_MAX)

    @field_validator("body")
    @classmethod
    def _validate_body(cls, value: str) -> str:
        return _clean_body(value, max_length=COMMENT_BODY_MAX)


class SpaceCommentRead(BaseSchema):
    id: str
    post_id: str
    author: FeedAuthor
    body: str
    can_edit: bool = False
    can_delete: bool = False
    created_at: datetime
    updated_at: datetime


SpacePostRead.model_rebuild()
