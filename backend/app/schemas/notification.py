"""Notifications (ST-69 M5). See `docs/spaces.md`, "Notifications".

One typed payload model per `NotificationType`, joined in a discriminated union on `kind` (a
string literal, separate from the row's own integer `type`). This gives the generated TypeScript
client a proper tagged union: the frontend narrows on `notification.type` and reads the matching
payload shape with no joins, because the payload stores titles and ids at write time
(`notification_service.notify`).
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.core.enums import NotificationType, SpaceItemKind, SpaceKind
from app.schemas.base import BaseSchema
from app.schemas.pagination import CursorPage

# ── Payloads (one per NotificationType) ───────────────────────────────────────


class InviteReceivedPayload(BaseSchema):
    kind: Literal["invite_received"] = "invite_received"
    space_id: str
    space_title: str
    space_kind: SpaceKind
    actor_name: str


class JoinRequestedPayload(BaseSchema):
    kind: Literal["join_requested"] = "join_requested"
    space_id: str
    space_title: str
    space_kind: SpaceKind
    actor_name: str


class RequestApprovedPayload(BaseSchema):
    kind: Literal["request_approved"] = "request_approved"
    space_id: str
    space_title: str
    space_kind: SpaceKind


class ContentPublishedPayload(BaseSchema):
    """`classroom_id` / `classroom_title` are set only for a classroom course; None for a standalone course."""

    kind: Literal["content_published"] = "content_published"
    space_id: str
    space_title: str
    classroom_id: str | None = None
    classroom_title: str | None = None
    message: str | None = None


class PostCreatedPayload(BaseSchema):
    kind: Literal["post_created"] = "post_created"
    space_id: str
    space_title: str
    post_id: str
    excerpt: str
    actor_name: str


class CommentCreatedPayload(BaseSchema):
    kind: Literal["comment_created"] = "comment_created"
    space_id: str
    space_title: str
    post_id: str
    comment_id: str
    excerpt: str
    actor_name: str


class DueSoonPayload(BaseSchema):
    kind: Literal["due_soon"] = "due_soon"
    item_id: str
    item_title: str
    item_kind: SpaceItemKind
    space_id: str
    space_title: str
    classroom_id: str
    due_at: datetime


class GradeOverriddenPayload(BaseSchema):
    kind: Literal["grade_overridden"] = "grade_overridden"
    result_id: str
    item_title: str
    space_id: str
    space_title: str
    score: float
    points: float
    actor_name: str


NotificationPayload = Annotated[
    InviteReceivedPayload
    | JoinRequestedPayload
    | RequestApprovedPayload
    | ContentPublishedPayload
    | PostCreatedPayload
    | CommentCreatedPayload
    | DueSoonPayload
    | GradeOverriddenPayload,
    Field(discriminator="kind"),
]

# The `kind` each `NotificationType` must carry (checked by `NotificationRead`, below).
_PAYLOAD_KIND_BY_TYPE: dict[NotificationType, str] = {
    NotificationType.INVITE_RECEIVED: "invite_received",
    NotificationType.JOIN_REQUESTED: "join_requested",
    NotificationType.REQUEST_APPROVED: "request_approved",
    NotificationType.CONTENT_PUBLISHED: "content_published",
    NotificationType.POST_CREATED: "post_created",
    NotificationType.COMMENT_CREATED: "comment_created",
    NotificationType.DUE_SOON: "due_soon",
    NotificationType.GRADE_OVERRIDDEN: "grade_overridden",
}


# ── Rows ────────────────────────────────────────────────────────────────────


class NotificationRead(BaseSchema):
    id: str
    type: NotificationType
    space_id: str | None
    actor_id: str | None
    payload: NotificationPayload
    read_at: datetime | None
    created_at: datetime

    @model_validator(mode="after")
    def _check_payload_matches_type(self) -> "NotificationRead":
        expected = _PAYLOAD_KIND_BY_TYPE[self.type]
        if self.payload.kind != expected:
            raise ValueError(f"payload kind {self.payload.kind!r} does not match notification type {self.type!r}")
        return self


NotificationPage = CursorPage[NotificationRead]


class UnreadCount(BaseSchema):
    count: int
