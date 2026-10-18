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

/** Resets the form after a save of the class key fields only. A feed permission save must not clear typed input. */
export function classKeyFormKey(settings: ClassroomSettingsRead): string {
  const { hasClassKey, aiProvider, monthlyTokenCapPerStudent, keyPriority, keyScope } = settings;
  return JSON.stringify([hasClassKey, aiProvider, monthlyTokenCapPerStudent, keyPriority, keyScope]);
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

const PROVIDER_NEEDS_KEY = 'Send a new Class key when you change the provider';

/** True when the owner changed the provider while a key is saved and typed no new key (the key belongs to the old provider). */
export function providerChangeNeedsKey(form: ClassKeyForm, saved: ClassroomSettingsRead): boolean {
  return saved.hasClassKey && form.aiProvider !== saved.aiProvider && form.keyInput.trim() === '';
}

/** The i18n key for a refused settings write that the backend explains in English only. `null` for any other detail. */
export function classSettingsErrorKey(detail: string | undefined): string | null {
  return detail === PROVIDER_NEEDS_KEY ? 'classrooms.class_key_provider_needs_key' : null;
}
