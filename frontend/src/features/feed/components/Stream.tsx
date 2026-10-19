'use client';

import { useTranslations } from 'next-intl';

import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { FEED_LIMITS } from '@/lib/limits';

import { useCreatePost, usePosts } from '../hooks/useFeed';

import { BodyForm } from './BodyForm';
import { PostCard } from './PostCard';

/**
 * The Stream tab of a classroom: the composer (if the user may post), the posts newest first
 * and a "Load more" button. A classroom that is archived or whose `feed_permission` forbids a write
 * shows no composer: `canPost` and `canComment` come with the first page.
 */
export function Stream({ classroomId }: { classroomId: string }) {
  const t = useTranslations('feed');
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = usePosts(classroomId);
  const { mutate: createPost, isPending: isPosting } = useCreatePost(classroomId);

  const canPost = data?.pages[0]?.canPost === true;
  const canComment = data?.pages[0]?.canComment === true;
  const posts = data?.pages.flatMap(page => page.items) ?? [];

  return (
    <QueryState
      isLoading={isLoading}
      isError={isError}
      errorMessage={t('failed_to_load')}
      className="flex flex-col gap-4"
    >
      {canPost && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <BodyForm
            maxLength={FEED_LIMITS.post}
            label={t('post_label')}
            placeholder={t('post_placeholder')}
            submitLabel={t('post')}
            isSubmitting={isPosting}
            onSubmit={(body, onDone) => createPost(body, { onSuccess: onDone })}
          />
        </div>
      )}

      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-4 py-12 text-center shadow-card">
          <h2 className="text-base font-semibold text-foreground">{t('empty_title')}</h2>
          <p className="text-sm text-muted-foreground">{canPost ? t('empty_can_post') : t('empty_text')}</p>
        </div>
      ) : (
        posts.map(post => <PostCard key={post.id} classroomId={classroomId} post={post} canComment={canComment} />)
      )}

      {hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="self-center"
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {t('load_more')}
        </Button>
      )}
    </QueryState>
  );
}
