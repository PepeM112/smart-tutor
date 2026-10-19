'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpaceCommentRead } from '@/client';
import { FEED_LIMITS } from '@/lib/limits';

import { useDeleteComment, useUpdateComment } from '../hooks/useFeed';

import { BodyForm } from './BodyForm';
import { FeedItemHeader } from './FeedItemHeader';

/** One comment under a post, with inline edit (author only) and delete (`canEdit` / `canDelete` come from the backend). */
export function CommentItem({ classroomId, comment }: { classroomId: string; comment: SpaceCommentRead }) {
  const t = useTranslations('feed');
  const [isEditing, setIsEditing] = useState(false);
  const { mutate: updateComment, isPending: isSaving } = useUpdateComment(classroomId);
  const { mutate: deleteComment, isPending: isDeleting } = useDeleteComment(classroomId);

  return (
    <li className="flex flex-col gap-1" data-testid="feed-comment">
      <FeedItemHeader
        author={comment.author}
        createdAt={comment.createdAt}
        updatedAt={comment.updatedAt}
        canEdit={comment.canEdit === true && !isEditing}
        canDelete={comment.canDelete === true}
        isDeleting={isDeleting}
        onEdit={() => setIsEditing(true)}
        onDelete={() => deleteComment(comment.id)}
        deleteTitle={t('delete_comment_title')}
        deleteDescription={t('delete_comment_confirm')}
      />
      {isEditing ? (
        <BodyForm
          initialValue={comment.body}
          maxLength={FEED_LIMITS.comment}
          label={t('edit_comment_label')}
          submitLabel={t('save')}
          isSubmitting={isSaving}
          autoFocus
          onSubmit={(body, onDone) =>
            updateComment(
              { id: comment.id, body },
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
        <p className="text-sm break-words whitespace-pre-line text-foreground">{comment.body}</p>
      )}
    </li>
  );
}
