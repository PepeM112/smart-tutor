'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { type SpaceAttemptStart } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ExamView } from '@/features/tests/components/ExamView';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { sdk } from '@/lib/apiClient';
import { courseHref, Routes } from '@/lib/routes';
import { errorStatus, getErrorDetail } from '@/lib/utils';

import { useAttemptDraft, type AttemptAnswers } from '../hooks/useAttemptDraft';
import { useCourse } from '../hooks/useCourse';
import { useVisitItem } from '../hooks/useCourseProgress';
import { isCourseViewer } from '../lib/progress';
import { courseQueryKeys } from '../lib/queryKeys';

type Props = {
  courseId: string;
  itemId: string;
};

/** HTTP status for a refused attempt: time over, course archived, or no attempts left. */
const CONFLICT = 409;

/**
 * One attempt on a TEST item. The page starts the attempt (or resumes the open one: the call is
 * idempotent), shows the exam with a countdown, and sends the answers. The answers also stay in
 * `localStorage` (D11), and a leave guard asks before the student leaves an open attempt (D12).
 */
export function CourseAttemptPage({ courseId, itemId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  const { data: course } = useCourse(courseId);
  useVisitItem(courseId, itemId, course !== undefined && isCourseViewer(course));
  const courseUrl = course ? courseHref(course) : `${Routes.COURSES}/${courseId}`;

  const {
    data: attempt,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['courses', 'attempt', courseId, itemId],
    // The start call is idempotent, but it must not run again on focus or reconnect.
    queryFn: async (): Promise<SpaceAttemptStart> =>
      (await sdk.spacesStartAttempt({ path: { space_id: courseId, item_id: itemId }, throwOnError: true })).data,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const attemptId = attempt?.attemptId ?? null;
  const draft = useAttemptDraft(userId, attemptId);

  const leaveCourse = (message: string) => {
    draft.clear();
    toast.error(message);
    router.replace(courseUrl);
  };

  const { mutate: submitAttempt, isPending: isSubmitting } = useMutation({
    mutationFn: async (answers: AttemptAnswers) => {
      if (!attemptId) return null;
      return (
        await sdk.spacesSubmitAttempt({
          path: { space_id: courseId, attempt_id: attemptId },
          body: {
            answers: Object.entries(answers).map(([questionId, userAnswer]) => ({ questionId, userAnswer })),
          },
          throwOnError: true,
        })
      ).data;
    },
    onSuccess: async result => {
      draft.clear();
      if (!result) {
        // An author preview has no attempt row, so there is no result to show.
        router.replace(courseUrl);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['results'] }),
        queryClient.invalidateQueries({ queryKey: courseQueryKeys.detail(courseId) }),
        queryClient.invalidateQueries({ queryKey: courseQueryKeys.mine() }),
      ]);
      router.replace(Routes.RESULT_DETAIL(result.id));
    },
    onError: (err: unknown) => {
      if (errorStatus(err) === CONFLICT) {
        leaveCourse(getErrorDetail(err, t('courses.attempt_refused')));
        return;
      }
      toast.error(getErrorDetail(err, t('tests.failed_to_submit')));
    },
  });

  // A refused start (no attempts left, cooldown, archived) sends the student back to the course.
  const startRefused = isError && errorStatus(error) === CONFLICT;
  useEffect(() => {
    if (!startRefused) return;
    toast.error(getErrorDetail(error, t('courses.attempt_refused')));
    router.replace(courseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRefused]);

  useBreadcrumb(
    attempt?.test.title ?? t('tests.take_test'),
    [
      { label: t('courses.title'), href: Routes.COURSES },
      ...(course ? [{ label: course.title, href: courseHref(course) }] : []),
    ],
    courseUrl
  );

  // The guard is active while an attempt is open and the answers are not on their way.
  const { pendingHref, confirmLeave, cancelLeave } = useLeaveGuard(attemptId !== null && !isSubmitting);

  return (
    <QueryState isLoading={isLoading || startRefused} isError={isError} errorMessage={t('tests.failed_to_load')}>
      {attempt && (
        <>
          <ExamView
            // A new attempt must start with its own answers.
            key={attemptId ?? 'preview'}
            test={attempt.test}
            onSubmit={submitAttempt}
            isSubmitting={isSubmitting}
            initialAnswers={draft.initialAnswers}
            onAnswersChange={draft.save}
            deadlineAt={attempt.deadlineAt}
          />
          <ConfirmDialog
            open={pendingHref !== null}
            onOpenChange={open => {
              if (!open) cancelLeave();
            }}
            title={t('courses.leave_attempt_title')}
            description={t('courses.leave_attempt_description')}
            confirmLabel={t('courses.leave_attempt_confirm')}
            onConfirm={confirmLeave}
          />
        </>
      )}
    </QueryState>
  );
}
