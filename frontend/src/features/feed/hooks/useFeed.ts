import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type SpaceCommentRead, type SpacePostPage, type SpacePostRead } from '@/client';
import { sdk } from '@/lib/apiClient';
import { resetToFirstPage } from '@/lib/infiniteQuery';
import { getErrorDetail, retryUnlessDenied } from '@/lib/utils';

import { feedErrorKey } from '../lib/feedErrors';
import { feedQueryKeys } from '../lib/queryKeys';

/**
 * The posts of a classroom, newest first, 20 per page (`fetchNextPage` = "Load more").
 * There is no polling: the list refreshes on window focus and after the user's own writes.
 */
export function usePosts(classroomId: string): UseInfiniteQueryResult<InfiniteData<SpacePostPage, string | null>> {
  return useInfiniteQuery({
    queryKey: feedQueryKeys.posts(classroomId),
    queryFn: async ({ pageParam }): Promise<SpacePostPage> =>
      (
        await sdk.spacesListPosts({
          path: { space_id: classroomId },
          query: pageParam ? { cursor: pageParam } : undefined,
          throwOnError: true,
        })
      ).data,
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor,
    // The app default is off. The Stream is the one list that others write to, so it refreshes when the tab gets focus.
    refetchOnWindowFocus: true,
    retry: retryUnlessDenied,
  });
}

/** A refused write gets its own translated text when the `detail` is known, else the detail or the fallback. */
function useWriteErrorToast(fallbackKey: string): (err: unknown) => void {
  const t = useTranslations();
  return err => {
    const key = feedErrorKey(getErrorDetail(err, ''));
    toast.error(key ? t(key) : getErrorDetail(err, t(fallbackKey)));
  };
}

/**
 * Every write refetches the list from its first page (also after an error: a refused write often means the
 * permission or the content changed, so the composers and the list must show the current state). The extra
 * pages are dropped first: their cursors are stale after a write (see `resetToFirstPage`).
 */
function useRefreshPosts(classroomId: string): () => void {
  const queryClient = useQueryClient();
  return () => void resetToFirstPage(queryClient, feedQueryKeys.posts(classroomId));
}

export function useCreatePost(classroomId: string): UseMutationResult<SpacePostRead, unknown, string> {
  const t = useTranslations();
  const refresh = useRefreshPosts(classroomId);
  const onWriteError = useWriteErrorToast('feed.failed_to_post');

  return useMutation({
    mutationFn: async (body: string): Promise<SpacePostRead> =>
      (await sdk.spacesCreatePost({ path: { space_id: classroomId }, body: { body }, throwOnError: true })).data,
    onSuccess: () => {
      refresh();
      toast.success(t('feed.posted'));
    },
    onError: err => {
      refresh();
      onWriteError(err);
    },
  });
}

export function useUpdatePost(classroomId: string): UseMutationResult<SpacePostRead, unknown, UpdateInput> {
  const t = useTranslations();
  const refresh = useRefreshPosts(classroomId);
  const onWriteError = useWriteErrorToast('feed.failed_to_save');

  return useMutation({
    mutationFn: async ({ id, body }: UpdateInput): Promise<SpacePostRead> =>
      (await sdk.postsUpdatePost({ path: { post_id: id }, body: { body }, throwOnError: true })).data,
    onSuccess: () => {
      refresh();
      toast.success(t('feed.post_saved'));
    },
    onError: err => {
      refresh();
      onWriteError(err);
    },
  });
}

export function useDeletePost(classroomId: string): UseMutationResult<unknown, unknown, string> {
  const t = useTranslations();
  const refresh = useRefreshPosts(classroomId);
  const onWriteError = useWriteErrorToast('feed.failed_to_delete');

  return useMutation({
    mutationFn: (id: string) => sdk.postsDeletePost({ path: { post_id: id }, throwOnError: true }),
    onSuccess: () => {
      refresh();
      toast.success(t('feed.post_deleted'));
    },
    onError: err => {
      refresh();
      onWriteError(err);
    },
  });
}

export function useCreateComment(classroomId: string): UseMutationResult<SpaceCommentRead, unknown, CommentInput> {
  const t = useTranslations();
  const refresh = useRefreshPosts(classroomId);
  const onWriteError = useWriteErrorToast('feed.failed_to_comment');

  return useMutation({
    mutationFn: async ({ postId, body }: CommentInput): Promise<SpaceCommentRead> =>
      (await sdk.postsCreateComment({ path: { post_id: postId }, body: { body }, throwOnError: true })).data,
    onSuccess: () => {
      refresh();
      toast.success(t('feed.commented'));
    },
    onError: err => {
      refresh();
      onWriteError(err);
    },
  });
}

export function useUpdateComment(classroomId: string): UseMutationResult<SpaceCommentRead, unknown, UpdateInput> {
  const t = useTranslations();
  const refresh = useRefreshPosts(classroomId);
  const onWriteError = useWriteErrorToast('feed.failed_to_save');

  return useMutation({
    mutationFn: async ({ id, body }: UpdateInput): Promise<SpaceCommentRead> =>
      (await sdk.commentsUpdateComment({ path: { comment_id: id }, body: { body }, throwOnError: true })).data,
    onSuccess: () => {
      refresh();
      toast.success(t('feed.comment_saved'));
    },
    onError: err => {
      refresh();
      onWriteError(err);
    },
  });
}

export function useDeleteComment(classroomId: string): UseMutationResult<unknown, unknown, string> {
  const t = useTranslations();
  const refresh = useRefreshPosts(classroomId);
  const onWriteError = useWriteErrorToast('feed.failed_to_delete');

  return useMutation({
    mutationFn: (id: string) => sdk.commentsDeleteComment({ path: { comment_id: id }, throwOnError: true }),
    onSuccess: () => {
      refresh();
      toast.success(t('feed.comment_deleted'));
    },
    onError: err => {
      refresh();
      onWriteError(err);
    },
  });
}

type UpdateInput = { id: string; body: string };
type CommentInput = { postId: string; body: string };
