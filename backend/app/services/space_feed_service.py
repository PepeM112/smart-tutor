"""The Stream feed of a classroom: posts and flat comments (ST-69 M5). See `docs/spaces.md`, "Feed".

v1 scope: a feed exists only for a CLASSROOM-kind space (not a course). Only an ACTIVE member (owner,
co-teacher, or student) may read it; an archived classroom is read-only for everyone. `feed_permission`
(`ClassroomSettings`, set by the owner in Settings) gates who may *write*:

- TEACHERS_ONLY: only the owner / co-teachers post or comment.
- STUDENTS_COMMENT (default): the owner / co-teachers post; everyone comments.
- STUDENTS_POST_AND_COMMENT: everyone posts and comments.

The author always edits/deletes their own post or comment; the owner / co-teachers may additionally
delete (but not edit) anyone's, for moderation -- which sends no notification.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.constants import NOTIFICATION_EXCERPT_MAX
from app.core.enums import FeedPermission, NotificationType
from app.crud import classroom_settings as classroom_settings_crud
from app.crud import space_comment as space_comment_crud
from app.crud import space_member as space_member_crud
from app.crud import space_post as space_post_crud
from app.crud import user as user_crud
from app.models.space import Space
from app.models.space_comment import SpaceComment
from app.models.space_post import SpacePost
from app.models.user import User
from app.schemas.notification import CommentCreatedPayload, PostCreatedPayload
from app.schemas.space_feed import (
    FeedAuthor,
    SpaceCommentCreate,
    SpaceCommentRead,
    SpaceCommentUpdate,
    SpacePostCreate,
    SpacePostPage,
    SpacePostRead,
    SpacePostUpdate,
)
from app.services import notification_service
from app.services.space_service import (
    Membership,
    forbidden,
    get_classroom_or_404,
    get_membership,
    is_archived,
    require_active,
)


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _feed_permission(db: Session, *, classroom: Space) -> FeedPermission:
    """Falls back to the column default when a classroom somehow has no settings row yet."""
    settings = classroom_settings_crud.get(db, space_id=classroom.id)
    return FeedPermission(settings.feed_permission) if settings is not None else FeedPermission.STUDENTS_COMMENT


def _excerpt(body: str) -> str:
    text = " ".join(body.split())
    return text if len(text) <= NOTIFICATION_EXCERPT_MAX else text[: NOTIFICATION_EXCERPT_MAX - 1].rstrip() + "…"


def _require_member(db: Session, *, classroom: Space, user: User) -> Membership:
    membership = get_membership(db, space=classroom, user=user)
    if membership.role is None:
        raise forbidden()
    return membership


def _can_post(permission: FeedPermission, *, membership: Membership) -> bool:
    return membership.can_author or permission == FeedPermission.STUDENTS_POST_AND_COMMENT


def _can_comment(permission: FeedPermission, *, membership: Membership) -> bool:
    allowed = {FeedPermission.STUDENTS_COMMENT, FeedPermission.STUDENTS_POST_AND_COMMENT}
    return membership.can_author or permission in allowed


def _require_can_post(db: Session, *, classroom: Space, membership: Membership) -> None:
    if not _can_post(_feed_permission(db, classroom=classroom), membership=membership):
        raise forbidden("Only the teacher can post in this classroom")


def _require_can_comment(db: Session, *, classroom: Space, membership: Membership) -> None:
    if not _can_comment(_feed_permission(db, classroom=classroom), membership=membership):
        raise forbidden("Only the teacher can comment in this classroom")


def _get_post_and_classroom(db: Session, *, post_id: str) -> tuple[SpacePost, Space]:
    post = space_post_crud.get(db, post_id=post_id)
    if post is None:
        raise _not_found("Post not found")
    classroom = get_classroom_or_404(db, space_id=post.space_id)
    return post, classroom


def _get_comment_and_context(db: Session, *, comment_id: str) -> tuple[SpaceComment, SpacePost, Space]:
    comment = space_comment_crud.get(db, comment_id=comment_id)
    if comment is None:
        raise _not_found("Comment not found")
    post, classroom = _get_post_and_classroom(db, post_id=comment.post_id)
    return comment, post, classroom


def _author(authors: dict[str, User], user_id: str) -> FeedAuthor:
    # `author_id` is FK CASCADE to `user.id`, so a post/comment never outlives its author.
    user = authors[user_id]
    return FeedAuthor(user_id=user.id, username=user.username, display_name=user.display_name)


def _authors_of(db: Session, *, posts: list[SpacePost], comments: list[SpaceComment]) -> dict[str, User]:
    ids = {p.author_id for p in posts} | {c.author_id for c in comments}
    return {u.id: u for u in user_crud.list_by_ids(db, ids=list(ids))}


def _post_read(
    post: SpacePost,
    comments: list[SpaceComment],
    authors: dict[str, User],
    *,
    current_user: User,
    membership: Membership,
) -> SpacePostRead:
    is_author = post.author_id == current_user.id
    return SpacePostRead(
        id=post.id,
        space_id=post.space_id,
        author=_author(authors, post.author_id),
        body=post.body,
        can_edit=is_author,
        can_delete=is_author or membership.can_author,
        comments=[_comment_read(c, authors, current_user=current_user, membership=membership) for c in comments],
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _comment_read(
    comment: SpaceComment, authors: dict[str, User], *, current_user: User, membership: Membership
) -> SpaceCommentRead:
    is_author = comment.author_id == current_user.id
    return SpaceCommentRead(
        id=comment.id,
        post_id=comment.post_id,
        author=_author(authors, comment.author_id),
        body=comment.body,
        can_edit=is_author,
        can_delete=is_author or membership.can_author,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


# ── Posts ─────────────────────────────────────────────────────────────────────


def list_posts(db: Session, *, space_id: str, current_user: User, cursor: str | None, limit: int) -> SpacePostPage:
    classroom = get_classroom_or_404(db, space_id=space_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    rows = space_post_crud.list_page(db, space_id=classroom.id, cursor=cursor, limit=limit)
    page = list(rows[:limit])
    # The cursor is the last item ON the page, not the lookahead row: `WHERE id < cursor` must not skip it.
    next_cursor = page[-1].id if len(rows) > limit else None
    comments = list(space_comment_crud.list_for_posts(db, post_ids=[p.id for p in page]))
    by_post: dict[str, list[SpaceComment]] = {}
    for c in comments:
        by_post.setdefault(c.post_id, []).append(c)
    authors = _authors_of(db, posts=page, comments=comments)
    items = [
        _post_read(post, by_post.get(post.id, []), authors, current_user=current_user, membership=membership)
        for post in page
    ]
    # An archived classroom is read-only for everyone, so no composer is offered.
    writable = not is_archived(db, space=classroom)
    permission = _feed_permission(db, classroom=classroom)
    return SpacePostPage(
        items=items,
        next_cursor=next_cursor,
        can_post=writable and _can_post(permission, membership=membership),
        can_comment=writable and _can_comment(permission, membership=membership),
    )


def _notify_post_created(db: Session, *, classroom: Space, post: SpacePost, current_user: User) -> None:
    recipients = space_member_crud.list_active_member_ids(db, space_id=classroom.id) | {classroom.owner_id}
    notification_service.notify(
        db,
        notification_type=NotificationType.POST_CREATED,
        recipients=recipients,
        actor_id=current_user.id,
        space_id=classroom.id,
        payload=PostCreatedPayload(
            space_id=classroom.id,
            space_title=classroom.title,
            post_id=post.id,
            excerpt=_excerpt(post.body),
            actor_name=notification_service.actor_name(current_user),
        ),
    )


def create_post(db: Session, *, space_id: str, current_user: User, data: SpacePostCreate) -> SpacePostRead:
    classroom = get_classroom_or_404(db, space_id=space_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    require_active(db, classroom)
    _require_can_post(db, classroom=classroom, membership=membership)
    post = space_post_crud.create(db, space_id=classroom.id, author_id=current_user.id, body=data.body)
    _notify_post_created(db, classroom=classroom, post=post, current_user=current_user)
    db.commit()
    db.refresh(post)
    return _post_read(post, [], {current_user.id: current_user}, current_user=current_user, membership=membership)


def update_post(db: Session, *, post_id: str, current_user: User, data: SpacePostUpdate) -> SpacePostRead:
    post, classroom = _get_post_and_classroom(db, post_id=post_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    if post.author_id != current_user.id:
        raise forbidden("Only the author can edit this post")
    require_active(db, classroom)
    space_post_crud.update(db, post=post, body=data.body)
    db.commit()
    comments = list(space_comment_crud.list_for_posts(db, post_ids=[post.id]))
    authors = _authors_of(db, posts=[post], comments=comments)
    return _post_read(post, comments, authors, current_user=current_user, membership=membership)


def delete_post(db: Session, *, post_id: str, current_user: User) -> None:
    post, classroom = _get_post_and_classroom(db, post_id=post_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    if not (post.author_id == current_user.id or membership.can_author):
        raise forbidden()
    require_active(db, classroom)
    space_post_crud.delete(db, post=post)
    db.commit()


# ── Comments ──────────────────────────────────────────────────────────────────


def list_comments(db: Session, *, post_id: str, current_user: User) -> list[SpaceCommentRead]:
    post, classroom = _get_post_and_classroom(db, post_id=post_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    comments = list(space_comment_crud.list_for_posts(db, post_ids=[post.id]))
    authors = _authors_of(db, posts=[], comments=comments)
    return [_comment_read(c, authors, current_user=current_user, membership=membership) for c in comments]


def _notify_comment_created(
    db: Session, *, classroom: Space, post: SpacePost, comment: SpaceComment, current_user: User
) -> None:
    # The post author may have been removed from the classroom since: no notification then.
    recipients = notification_service.with_space_access(db, space=classroom, user_ids={post.author_id})
    notification_service.notify(
        db,
        notification_type=NotificationType.COMMENT_CREATED,
        recipients=recipients,
        actor_id=current_user.id,
        space_id=classroom.id,
        payload=CommentCreatedPayload(
            space_id=classroom.id,
            space_title=classroom.title,
            post_id=post.id,
            comment_id=comment.id,
            excerpt=_excerpt(comment.body),
            actor_name=notification_service.actor_name(current_user),
        ),
    )


def create_comment(db: Session, *, post_id: str, current_user: User, data: SpaceCommentCreate) -> SpaceCommentRead:
    post, classroom = _get_post_and_classroom(db, post_id=post_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    require_active(db, classroom)
    _require_can_comment(db, classroom=classroom, membership=membership)
    comment = space_comment_crud.create(db, post_id=post.id, author_id=current_user.id, body=data.body)
    _notify_comment_created(db, classroom=classroom, post=post, comment=comment, current_user=current_user)
    db.commit()
    db.refresh(comment)
    return _comment_read(comment, {current_user.id: current_user}, current_user=current_user, membership=membership)


def update_comment(db: Session, *, comment_id: str, current_user: User, data: SpaceCommentUpdate) -> SpaceCommentRead:
    comment, _post, classroom = _get_comment_and_context(db, comment_id=comment_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    if comment.author_id != current_user.id:
        raise forbidden("Only the author can edit this comment")
    require_active(db, classroom)
    space_comment_crud.update(db, comment=comment, body=data.body)
    db.commit()
    authors = _authors_of(db, posts=[], comments=[comment])
    return _comment_read(comment, authors, current_user=current_user, membership=membership)


def delete_comment(db: Session, *, comment_id: str, current_user: User) -> None:
    comment, _post, classroom = _get_comment_and_context(db, comment_id=comment_id)
    membership = _require_member(db, classroom=classroom, user=current_user)
    if not (comment.author_id == current_user.id or membership.can_author):
        raise forbidden()
    require_active(db, classroom)
    space_comment_crud.delete(db, comment=comment)
    db.commit()
