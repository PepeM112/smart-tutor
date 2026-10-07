import { type AiToolPermissionRead, type UserRead, type UserUpdate } from '@/client';

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

export const SETTINGS_TABS = ['profile', 'ai', 'appearance', 'srs'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'profile';

/** Returns a valid tab, or the default tab for a missing or unknown value. */
export function parseSettingsTab(value: string | null | undefined): SettingsTab {
  return SETTINGS_TABS.find(tab => tab === value) ?? DEFAULT_SETTINGS_TAB;
}

const PAYLOAD_KEY_TAB: Record<keyof UserUpdate & keyof SettingsForm, SettingsTab> = {
  displayName: 'profile',
  aiProvider: 'ai',
  anthropicApiKey: 'ai',
  openaiApiKey: 'ai',
  dailyReviewLimit: 'srs',
  initialEaseFactor: 'srs',
};

/**
 * Returns the tabs that have unsaved changes. A tab is dirty when the settings payload has one of its
 * keys, or (for the AI tab) when the permission draft is not empty. Appearance and language are not in
 * the payload: they save on their own, so that tab is never dirty. Pure — no side effects.
 */
export function getDirtyTabs(
  settingsPayload: UserUpdate,
  permissionsPayload: Record<string, boolean>
): Set<SettingsTab> {
  const tabs = Object.keys(settingsPayload).flatMap(key => {
    const tab = PAYLOAD_KEY_TAB[key as keyof typeof PAYLOAD_KEY_TAB];
    return tab ? [tab] : [];
  });
  return new Set<SettingsTab>(Object.keys(permissionsPayload).length > 0 ? [...tabs, 'ai'] : tabs);
}

/** Draft of the AI tool permissions: only the tools the user changed, as `tool name -> autoApprove`. */
export type PermissionDraft = Record<string, boolean>;

/**
 * Adds new changes to the draft. A change that equals the server value is removed,
 * so the draft holds only real differences. Pure — no side effects.
 */
export function mergePermissionDraft(
  server: readonly AiToolPermissionRead[],
  draft: PermissionDraft,
  changes: PermissionDraft
): PermissionDraft {
  const serverByName = new Map(server.map(tool => [tool.name, tool.autoApprove]));
  return Object.fromEntries(
    Object.entries({ ...draft, ...changes }).filter(([name, value]) => serverByName.get(name) !== value)
  );
}

/** Shows the server permissions with the draft applied on top. */
export function applyPermissionDraft(
  server: readonly AiToolPermissionRead[],
  draft: PermissionDraft
): AiToolPermissionRead[] {
  return server.map(tool => ({ ...tool, autoApprove: draft[tool.name] ?? tool.autoApprove }));
}

/**
 * Returns only the keys that differ from the server data, as the PATCH payload.
 * An empty object means there is nothing to save.
 */
export function buildPermissionsPayload(
  server: readonly AiToolPermissionRead[],
  draft: PermissionDraft
): Record<string, boolean> {
  const serverByName = new Map(server.map(tool => [tool.name, tool.autoApprove]));
  return Object.fromEntries(Object.entries(draft).filter(([name, value]) => serverByName.get(name) !== value));
}
