import { useCallback, useMemo } from 'react';

export type AttemptAnswers = Record<string, string>;

/** One key per user and attempt, so two accounts on one device never mix their answers. */
export const attemptDraftKey = (userId: string, attemptId: string): string => `st:attempt:${userId}:${attemptId}`;

/** Every access is in try/catch: `localStorage` can throw (private mode, blocked site data) or hold bad data. */
export function readAttemptAnswers(key: string): AttemptAnswers {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string'));
  } catch {
    return {};
  }
}

export function writeAttemptAnswers(key: string, answers: AttemptAnswers): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(answers));
  } catch {
    // The answers still live in memory: the draft is a convenience, so a failed write is not an error.
  }
}

export function removeAttemptAnswers(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up when storage is not available.
  }
}

type AttemptDraft = {
  /** The answers saved for this attempt on this device (read once per attempt). */
  initialAnswers: AttemptAnswers;
  /** Call on each change. */
  save: (answers: AttemptAnswers) => void;
  /** Call on submit, expiry or a 409. */
  clear: () => void;
};

/**
 * Keeps the answers of an open course attempt in `localStorage` (D11), so a reload or a closed tab
 * does not lose them on the same device. A change of device loses them: the server holds no draft.
 */
export function useAttemptDraft(userId: string | undefined, attemptId: string | null | undefined): AttemptDraft {
  const key = userId && attemptId ? attemptDraftKey(userId, attemptId) : null;
  // The key changes only when the attempt is known, so one read per attempt.
  const initialAnswers = useMemo(() => (key ? readAttemptAnswers(key) : {}), [key]);
  const save = useCallback(
    (answers: AttemptAnswers) => {
      if (key) writeAttemptAnswers(key, answers);
    },
    [key]
  );
  const clear = useCallback(() => {
    if (key) removeAttemptAnswers(key);
  }, [key]);

  return { initialAnswers, save, clear };
}
