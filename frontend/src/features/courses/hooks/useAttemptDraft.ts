import { useCallback, useEffect, useMemo } from 'react';

export type AttemptAnswers = Record<string, string>;

/**
 * A draft older than this is dropped on the next start. Trade-off: an attempt with no time limit and no
 * `closes_at` never ends, so its draft can be older and is lost. Server-side drafts are the planned fix.
 */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

  // Drafts of attempts that ended without a clear expire by age, not by "not the current attempt":
  // a second open tab must not wipe the draft of the first one.
  useEffect(() => {
    if (userId && attemptId) removeExpiredAttemptDrafts(userId, attemptId);
  }, [userId, attemptId]);

  return { initialAnswers, save, clear };
}

function attemptDraftPrefix(userId: string): string {
  return `st:attempt:${userId}:`;
}

/** One key per user and attempt, so two accounts on one device never mix their answers. */
export function attemptDraftKey(userId: string, attemptId: string): string {
  return `${attemptDraftPrefix(userId)}${attemptId}`;
}

/** Every access is in try/catch: `localStorage` can throw (private mode, blocked site data) or hold bad data. */
export function readAttemptAnswers(key: string): AttemptAnswers {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // The old format (a bare answers object) stays readable, so a reload during a deploy keeps the answers.
    return pickTextAnswers(isTimestampedDraft(parsed) ? parsed.answers : parsed);
  } catch {
    return {};
  }
}

function writeAttemptAnswers(key: string, answers: AttemptAnswers): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ answers, savedAt: Date.now() }));
  } catch {
    // The answers still live in memory: the draft is a convenience, so a failed write is not an error.
  }
}

function removeAttemptAnswers(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up when storage is not available.
  }
}

/**
 * Deletes the drafts of this user that are older than `DRAFT_MAX_AGE_MS`, except the current attempt.
 * An attempt that expired and was never opened again leaves its draft behind: the next start cleans
 * it up (D11). A draft without `savedAt` (the format before timestamps) counts as expired.
 */
function removeExpiredAttemptDrafts(userId: string, keepAttemptId: string): void {
  try {
    const prefix = attemptDraftPrefix(userId);
    const keep = attemptDraftKey(userId, keepAttemptId);
    const storage = window.localStorage;
    const now = Date.now();
    Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((name): name is string => name !== null && name.startsWith(prefix) && name !== keep)
      .filter(name => isExpiredDraft(storage.getItem(name), now))
      .forEach(name => storage.removeItem(name));
  } catch {
    // Nothing to clean up when storage is not available.
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestampedDraft(value: unknown): value is { answers: unknown; savedAt: number } {
  return isPlainObject(value) && 'answers' in value && typeof value.savedAt === 'number';
}

function pickTextAnswers(value: unknown): AttemptAnswers {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function isExpiredDraft(raw: string | null, now: number): boolean {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return !isTimestampedDraft(parsed) || now - parsed.savedAt > DRAFT_MAX_AGE_MS;
  } catch {
    return true;
  }
}
