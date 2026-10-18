import type { ClassroomSettingsRead, ClassroomSettingsUpdate, KeySource, KeySourceUsage } from '@/client';

export type TokenCapParse = { ok: true; value: number | null } | { ok: false };

/** Empty input means "no cap" (null). Otherwise the cap must be a whole number above 0. */
export function parseTokenCap(input: string): TokenCapParse {
  const text = input.trim().replace(/[\s_,.]/g, '');
  if (text === '') return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false };
  const value = Number(text);
  return value > 0 && Number.isSafeInteger(value) ? { ok: true, value } : { ok: false };
}

export type ClassKeyForm = {
  aiProvider: ClassroomSettingsRead['aiProvider'];
  keyInput: string;
  keyPriority: ClassroomSettingsRead['keyPriority'];
  keyScope: ClassroomSettingsRead['keyScope'];
  capInput: string;
};

export function formFromSettings(settings: ClassroomSettingsRead): ClassKeyForm {
  return {
    aiProvider: settings.aiProvider,
    keyInput: '',
    keyPriority: settings.keyPriority,
    keyScope: settings.keyScope,
    capInput: settings.monthlyTokenCapPerStudent == null ? '' : String(settings.monthlyTokenCapPerStudent),
  };
}

/**
 * Builds the PATCH body with only the fields that changed.
 * The key is sent only when the owner typed one, so a saved key is never overwritten by accident.
 * Returns null when the cap is not valid.
 */
export function buildSettingsUpdate(form: ClassKeyForm, saved: ClassroomSettingsRead): ClassroomSettingsUpdate | null {
  const cap = parseTokenCap(form.capInput);
  if (!cap.ok) return null;

  const body: ClassroomSettingsUpdate = {};
  if (form.aiProvider !== saved.aiProvider) body.aiProvider = form.aiProvider;
  if (form.keyInput.trim() !== '') body.classKey = form.keyInput.trim();
  if (form.keyPriority !== saved.keyPriority) body.keyPriority = form.keyPriority;
  if (form.keyScope !== saved.keyScope) body.keyScope = form.keyScope;
  if (cap.value !== saved.monthlyTokenCapPerStudent) body.monthlyTokenCapPerStudent = cap.value;
  return body;
}

export function hasChanges(update: ClassroomSettingsUpdate | null): boolean {
  return update != null && Object.keys(update).length > 0;
}

/** Tokens or cost of one source in a student's usage row. */
export function usageForSource(bySource: KeySourceUsage[], source: KeySource): KeySourceUsage | undefined {
  return bySource.find(entry => entry.keySource === source);
}
