'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpacePostRead } from '@/client';
import { FEED_LIMITS } from '@/lib/limits';

import { useCreateComment, useDeletePost, useUpdatePost } from '../hooks/useFeed';

import { BodyForm } from './BodyForm';
import { CommentItem } from './CommentItem';
import { FeedItemHeader } from './FeedItemHeader';

type PostCardProps = {
  classroomId: string;
  post: SpacePostRead;
  /** Shows the comment composer. The backend decides it for the user (`canComment` of the page). */
  canComment: boolean;
};

/** One post with its comments (oldest first), inline edit and delete, and a comment composer. */
export function PostCard({ classroomId, post, canComment }: PostCardProps) {
  const t = useTranslations('feed');
  const [isEditing, setIsEditing] = useState(false);
  const { mutate: updatePost, isPending: isSaving } = useUpdatePost(classroomId);
  const { mutate: deletePost, isPending: isDeleting } = useDeletePost(classroomId);
  const { mutate: createComment, isPending: isCommenting } = useCreateComment(classroomId);
  const comments = post.comments ?? [];

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
      data-testid="feed-post"
    >
      <FeedItemHeader
        author={post.author}
        createdAt={post.createdAt}
        updatedAt={post.updatedAt}
        canEdit={post.canEdit === true && !isEditing}
        canDelete={post.canDelete === true}
        isDeleting={isDeleting}
        onEdit={() => setIsEditing(true)}
        onDelete={() => deletePost(post.id)}
        deleteTitle={t('delete_post_title')}
        deleteDescription={t('delete_post_confirm')}
      />
      {isEditing ? (
        <BodyForm
          initialValue={post.body}
          maxLength={FEED_LIMITS.post}
          label={t('edit_post_label')}
          submitLabel={t('save')}
          isSubmitting={isSaving}
          autoFocus
          onSubmit={(body, onDone) =>
            updatePost(
              { id: post.id, body },
              {
                onSuccess: () => {
                  onDone();
                  setIsEditing(false);
                },
              }
            )
          }
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <p className="text-sm break-words whitespace-pre-line text-foreground">{post.body}</p>
      )}

      {(comments.length > 0 || canComment) && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {comments.length > 0 && (
            <ul className="flex flex-col gap-3" aria-label={t('comments')}>
              {comments.map(comment => (
                <CommentItem key={comment.id} classroomId={classroomId} comment={comment} />
              ))}
            </ul>
          )}
          {canComment && (
            <BodyForm
              maxLength={FEED_LIMITS.comment}
              label={t('comment_label')}
              placeholder={t('comment_placeholder')}
              submitLabel={t('comment')}
              isSubmitting={isCommenting}
              onSubmit={(body, onDone) => createComment({ postId: post.id, body }, { onSuccess: onDone })}
            />
          )}
        </div>
      )}
    </article>
  );
}
