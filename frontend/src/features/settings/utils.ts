import { type AiToolPermissionRead, type UserRead, type UserUpdate } from '@/client';

export const DEFAULT_EASE_FACTOR = 2.5;
// Same bounds as the backend validators. A value outside them would get a 422.
const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 5.0;
const MIN_DAILY_REVIEW_LIMIT = 1;

/** Each builder returns the `UserUpdate` for one field, or null when there is nothing to save. Pure. */
export function buildDisplayNamePatch(value: string, user: UserRead): UserUpdate | null {
  if (value === (user.displayName ?? '')) return null;
  return { displayName: value || null };
}

/** An empty field means "no limit". A value that is not a number, or is below the minimum, is not saved. */
export function buildDailyLimitPatch(value: string, user: UserRead): UserUpdate | null {
  const limit = value ? parseInt(value, 10) : null;
  if (Number.isNaN(limit) || (limit !== null && limit < MIN_DAILY_REVIEW_LIMIT)) return null;
  if (limit === (user.dailyReviewLimit ?? null)) return null;
  return { dailyReviewLimit: limit };
}

export function buildEaseFactorPatch(value: string, user: UserRead): UserUpdate | null {
  const ease = parseFloat(value);
  if (Number.isNaN(ease) || ease < MIN_EASE_FACTOR || ease > MAX_EASE_FACTOR) return null;
  if (ease === (user.initialEaseFactor ?? DEFAULT_EASE_FACTOR)) return null;
  return { initialEaseFactor: ease };
}

export const SETTINGS_TABS = ['profile', 'ai', 'appearance', 'srs'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'profile';

/** Returns a valid tab, or the default tab for a missing or unknown value. */
export function parseSettingsTab(value: string | null | undefined): SettingsTab {
  return SETTINGS_TABS.find(tab => tab === value) ?? DEFAULT_SETTINGS_TAB;
}

/** Changed AI tools as `tool name -> autoApprove`. */
export type PermissionDraft = Record<string, boolean>;

/** Returns the server permissions with the changes applied on top. */
export function applyPermissionDraft(
  server: readonly AiToolPermissionRead[],
  draft: PermissionDraft
): AiToolPermissionRead[] {
  return server.map(tool => ({ ...tool, autoApprove: draft[tool.name] ?? tool.autoApprove }));
}
