import { type UserRead, type UserUpdate } from '@/client';

import type { SettingsForm } from './types';

export const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Compares the settings form against the current user and returns only the
 * fields that changed, as a `UserUpdate` payload. Pure — no side effects.
 */
export function buildSettingsPayload(form: SettingsForm, user: UserRead | null): UserUpdate {
  const payload: UserUpdate = {};

  if (form.displayName !== (user?.displayName ?? '')) {
    payload.displayName = form.displayName || null;
  }

  if (form.aiProvider !== (user?.aiProvider ?? null)) {
    payload.aiProvider = form.aiProvider;
  }

  // Only send the key if the user typed a new one — empty field must not overwrite a saved key
  if (form.anthropicApiKey) {
    payload.anthropicApiKey = form.anthropicApiKey;
  }

  if (form.openaiApiKey) {
    payload.openaiApiKey = form.openaiApiKey;
  }

  const limit = form.dailyReviewLimit ? parseInt(form.dailyReviewLimit, 10) : null;
  if (limit !== (user?.dailyReviewLimit ?? null)) {
    payload.dailyReviewLimit = limit;
  }

  const ease = parseFloat(form.initialEaseFactor);
  if (!isNaN(ease) && ease !== (user?.initialEaseFactor ?? DEFAULT_EASE_FACTOR)) {
    payload.initialEaseFactor = ease;
  }

  return payload;
}
