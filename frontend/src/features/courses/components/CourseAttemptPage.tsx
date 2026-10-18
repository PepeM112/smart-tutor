'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { type SpaceAttemptStart } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useHideAssist } from '@/features/assist/store/useAssistHiddenStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ExamView } from '@/features/tests/components/ExamView';
import { syncServerClock } from '@/features/tests/utils/countdown';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { sdk } from '@/lib/apiClient';
import { courseHref, Routes } from '@/lib/routes';
import { errorStatus, getErrorDetail } from '@/lib/utils';

import { useAttemptDraft, type AttemptAnswers } from '../hooks/useAttemptDraft';
import { useAttemptRefusalMessage } from '../hooks/useAttemptRefusalMessage';
import { useCourse } from '../hooks/useCourse';
import { useVisitItem } from '../hooks/useCourseProgress';
import { findItem, isCourseViewer } from '../lib/progress';
import { courseQueryKeys, markCourseDetailStale } from '../lib/queryKeys';
import { courseCrumbs } from '../lib/spaceCrumbs';

import { AttemptStartCard } from './AttemptStartCard';

type Props = {
  courseId: string;
  itemId: string;
};

/** HTTP status for a refused attempt: time over, course archived, or no attempts left. */
const CONFLICT = 409;

/**
 * One attempt on a TEST item. An open attempt resumes at once. Without one, the page shows a start card
 * and starts the attempt only when the student presses Start (F7). It then shows the exam with a
 * countdown and sends the answers. The answers also stay in `localStorage` (D11), and a leave guard
 * asks before the student leaves an open attempt (D12). The Assistant is hidden while the attempt is open.
 */
export function CourseAttemptPage({ courseId, itemId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  const { data: course, isLoading: isCourseLoading } = useCourse(courseId);
  useVisitItem(courseId, itemId, course !== undefined && isCourseViewer(course));
  const courseUrl = course ? courseHref(course) : `${Routes.COURSES}/${courseId}`;

  const item = course ? findItem(course.sections, itemId) : undefined;
  // An open attempt resumes at once. A new attempt starts only on the click of the student.
  const [isStartRequested, setIsStartRequested] = useState(false);
  const isStartEnabled = !isCourseLoading && (Boolean(item?.openAttemptId) || isStartRequested);
  const refusalMessage = useAttemptRefusalMessage();

  const {
    data: attempt,
    isFetching: isStarting,
    isError,
    error,
  } = useQuery({
    queryKey: courseQueryKeys.attempt(courseId, itemId),
    enabled: isStartEnabled,
    // The start call is idempotent, but it must not run again on focus or reconnect.
    queryFn: async (): Promise<SpaceAttemptStart> => {
      const { data } = await sdk.spacesStartAttempt({
        path: { space_id: courseId, item_id: itemId },
        throwOnError: true,
      });
      // The deadline is in server time: the countdown reads the client clock plus this offset.
      syncServerClock(data.serverNow);
      return data;
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const attemptId = attempt?.attemptId ?? null;
  const draft = useAttemptDraft(userId, attemptId);

  // The start opened an attempt: the cached course detail does not know it yet (no `openAttemptId`).
  // Marked stale, the next visit to the course page reads it again.
  useEffect(() => {
    if (attemptId) markCourseDetailStale(queryClient, courseId);
  }, [attemptId, courseId, queryClient]);

  const leaveCourse = (message: string) => {
    draft.clear();
    toast.error(message);
    router.replace(courseUrl);
  };

  const {
    mutate: submitAttempt,
    isPending: isSubmitPending,
    isSuccess: isSubmitted,
  } = useMutation({
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
        leaveCourse(refusalMessage(err));
        return;
      }
      toast.error(getErrorDetail(err, t('tests.failed_to_submit')));
    },
  });

  // A refused start (no attempts left, cooldown, archived) sends the student back to the course.
  const startRefused = isError && errorStatus(error) === CONFLICT;
  useEffect(() => {
    if (!startRefused) return;
    toast.error(refusalMessage(error));
    router.replace(courseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRefused]);

  useBreadcrumb(
    attempt?.test.title ?? t('tests.take_test'),
    [
      ...courseCrumbs(course, { courses: t('courses.title'), classrooms: t('classrooms.title') }),
      ...(course ? [{ label: course.title, href: courseHref(course) }] : []),
    ],
    courseUrl
  );

  // From the success of the submit to the route change, the button and the leave guard stay off (F4).
  const isSubmitting = isSubmitPending || isSubmitted;
  // The guard is active while an attempt is open and the answers are not on their way.
  const { pendingHref, confirmLeave, cancelLeave } = useLeaveGuard(attemptId !== null && !isSubmitting);
  // The Assistant must not help during a timed attempt, and its navigation must not leave the page.
  useHideAssist(attempt !== undefined);

  const isWaiting = isCourseLoading || isStarting || startRefused;

  return (
    <QueryState
      isLoading={isWaiting && !attempt}
      isError={isError && !startRefused}
      errorMessage={t('tests.failed_to_load')}
    >
      {!attempt && <AttemptStartCard item={item} isStarting={isStarting} onStart={() => setIsStartRequested(true)} />}
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
