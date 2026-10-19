'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { type FeedAuthor } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatRelativeTime } from '@/lib/relativeTime';

import { authorName, isEdited } from '../lib/feedItem';

type FeedItemHeaderProps = {
  author: FeedAuthor;
  createdAt: Date;
  updatedAt: Date;
  /** Shows the edit button. */
  canEdit: boolean;
  /** Shows the delete button. */
  canDelete: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Text of the delete confirmation: the post or the comment. */
  deleteTitle: string;
  deleteDescription: string;
};

/** Author, relative time, "edited" label and the own-only actions of a post or a comment. */
export function FeedItemHeader({
  author,
  createdAt,
  updatedAt,
  canEdit,
  canDelete,
  isDeleting,
  onEdit,
  onDelete,
  deleteTitle,
  deleteDescription,
}: FeedItemHeaderProps) {
  const t = useTranslations('feed');
  const locale = useLocale();

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="truncate text-sm font-medium text-foreground">{authorName(author)}</span>
        <time
          dateTime={createdAt.toISOString()}
          title={createdAt.toLocaleString(locale)}
          className="text-xs text-muted-foreground"
        >
          {formatRelativeTime(createdAt, locale)}
        </time>
        {isEdited({ createdAt, updatedAt }) && <span className="text-xs text-muted-foreground">({t('edited')})</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canEdit && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('edit')} onClick={onEdit}>
            <Pencil />
          </Button>
        )}
        {canDelete && (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('delete')}
                className="text-destructive hover:text-destructive"
                disabled={isDeleting}
              >
                <Trash2 />
              </Button>
            }
            title={deleteTitle}
            description={deleteDescription}
            confirmLabel={t('delete')}
            onConfirm={onDelete}
          />
        )}
      </div>
    </div>
  );
}
