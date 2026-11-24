import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { sdk } from '@/lib/apiClient';
import { errorStatus } from '@/lib/utils';

import { classifyAttemptRefusal } from '../lib/attemptErrors';

import { type AttemptAnswers } from './useAttemptDraft';

const SAVE_DELAY_MS = 1500;
const CONFLICT = 409;
// One id, so a run of failed saves (offline) shows one toast and not one per keystroke.
const FAILED_TOAST_ID = 'attempt-draft-save-failed';

type ServerAttemptDraft = {
  /** Call on each change. The last answers go to the server after a short pause. */
  save: (answers: AttemptAnswers) => void;
  /** Call when the attempt is submitted: no save runs after it, and its errors stay silent. */
  stop: () => void;
};

/**
 * Autosaves the answers of an open attempt to the server, so another device or a cleared browser can resume.
 * Success is silent, like the Settings auto-save. `localStorage` (`useAttemptDraft`) still saves at once.
 */
export function useServerAttemptDraft(courseId: string, attemptId: string | null): ServerAttemptDraft {
  const t = useTranslations();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AttemptAnswers | null>(null);
  const isStopped = useRef(false);

  const { mutate: saveDraft } = useMutation({
    mutationFn: async (answers: AttemptAnswers) => {
      if (!attemptId) return;
      await sdk.spacesSaveAttemptDraft({
        path: { space_id: courseId, attempt_id: attemptId },
        body: { answers: Object.entries(answers).map(([questionId, userAnswer]) => ({ questionId, userAnswer })) },
        throwOnError: true,
      });
    },
    onError: (err: unknown) => {
      if (isStopped.current) return;
      // A refused save (time over, closed) is explained by the submit that follows. Only a failed call needs a toast.
      const isRefused = errorStatus(err) === CONFLICT && classifyAttemptRefusal(err).kind !== 'unknown';
      if (!isRefused) toast.error(t('courses.attempt_draft_save_failed'), { id: FAILED_TOAST_ID });
    },
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const answers = pending.current;
    pending.current = null;
    if (answers && !isStopped.current) saveDraft(answers);
  }, [saveDraft]);

  const save = useCallback(
    (answers: AttemptAnswers) => {
      if (!attemptId || isStopped.current) return;
      pending.current = answers;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [attemptId, flush]
  );

  const stop = useCallback(() => {
    isStopped.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  // Leaving the page sends the last answers that the pause has not sent yet.
  useEffect(() => flush, [flush]);

  return { save, stop };
}
