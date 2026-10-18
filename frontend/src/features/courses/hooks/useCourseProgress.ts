import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { type SpaceProgress } from '@/client';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { courseQueryKeys } from '../lib/queryKeys';

type ItemMutation = UseMutationResult<SpaceProgress, Error, string>;

/**
 * Mark a NOTE item as done, or take the mark away. Both give the new course progress.
 * The course detail refetches, so the circle of the item and the course percent both update.
 */
export function useCourseProgress(courseId: string): { markDone: ItemMutation; unmarkDone: ItemMutation } {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const path = (itemId: string) => ({ space_id: courseId, item_id: itemId });
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: courseQueryKeys.detail(courseId) });
    void queryClient.invalidateQueries({ queryKey: courseQueryKeys.mine() });
  };
  const onError = (err: unknown) => toast.error(getErrorDetail(err, t('courses.failed_to_save_progress')));

  const markDone = useMutation<SpaceProgress, Error, string>({
    mutationFn: async itemId => (await sdk.spacesMarkDone({ path: path(itemId), throwOnError: true })).data,
    onSuccess,
    onError,
  });
  const unmarkDone = useMutation<SpaceProgress, Error, string>({
    mutationFn: async itemId => (await sdk.spacesUnmarkDone({ path: path(itemId), throwOnError: true })).data,
    onSuccess,
    onError,
  });

  return { markDone, unmarkDone };
}

/**
 * Tells the server which item the student opened, once per item while `enabled`.
 * It is a hint for "Continue", so a failed call is not shown to the student.
 */
export function useVisitItem(courseId: string, itemId: string | null | undefined, enabled: boolean): void {
  const lastVisited = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !itemId || lastVisited.current === itemId) return;
    lastVisited.current = itemId;
    sdk.spacesVisit({ path: { space_id: courseId }, body: { itemId }, throwOnError: true }).catch(() => {
      // Let the next open of the item try again.
      lastVisited.current = null;
    });
  }, [courseId, itemId, enabled]);
}

type SentinelRef = (element: Element | null) => void;

/**
 * A ref for an element at the end of a note. `onReached` runs once, when the element scrolls into view.
 * Nothing is watched while `enabled` is false (for example, the note is done already).
 */
export function useEndSentinel(onReached: () => void, enabled: boolean): SentinelRef {
  const latest = useRef(onReached);
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    latest.current = onReached;
  });

  return useCallback<SentinelRef>(
    element => {
      // React calls the ref with null on unmount, and when `enabled` changes: stop the old watch first.
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element || !enabled || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        latest.current();
      });
      observer.observe(element);
      observerRef.current = observer;
    },
    [enabled]
  );
}
