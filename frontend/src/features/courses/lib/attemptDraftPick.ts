import { type AttemptAnswers } from '../hooks/useAttemptDraft';

export type DraftCopy = {
  answers: AttemptAnswers;
  /** Epoch ms on the server clock. Null when the copy has no timestamp. */
  savedAt: number | null;
};

/**
 * The answers to resume with. The server copy wins, because it is the same on every device. The local copy wins
 * only when it is newer: a save failed (offline) after the last one that reached the server.
 */
export function pickNewerAnswers(server: DraftCopy | null, local: DraftCopy): AttemptAnswers {
  if (!server) return local.answers;
  const isLocalNewer = local.savedAt !== null && (server.savedAt === null || local.savedAt > server.savedAt);
  return isLocalNewer ? local.answers : server.answers;
}
