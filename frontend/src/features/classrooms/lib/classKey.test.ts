import { describe, expect, it } from 'vitest';

import { AiProvider, type ClassroomSettingsRead, FeedPermission, KeyPriority, KeyScope, KeySource } from '@/client';

import {
  buildSettingsUpdate,
  classKeyFormKey,
  classSettingsErrorKey,
  formFromSettings,
  hasChanges,
  parseTokenCap,
  providerChangeNeedsKey,
  usageForSource,
} from './classKey';

const saved: ClassroomSettingsRead = {
  feedPermission: FeedPermission.TEACHERS_ONLY,
  aiProvider: AiProvider.ANTHROPIC,
  hasClassKey: true,
  keyPriority: KeyPriority.STUDENT,
  keyScope: KeyScope.CLASSROOM_CONTENT,
  monthlyTokenCapPerStudent: null,
};

describe('parseTokenCap', () => {
  it('treats empty input as no cap', () => {
    expect(parseTokenCap('  ')).toEqual({ ok: true, value: null });
  });
  it('parses whole numbers and ignores thousands separators', () => {
    expect(parseTokenCap('50000')).toEqual({ ok: true, value: 50000 });
    expect(parseTokenCap('50,000')).toEqual({ ok: true, value: 50000 });
  });
  it('rejects zero, negative and text', () => {
    expect(parseTokenCap('0')).toEqual({ ok: false });
    expect(parseTokenCap('-5')).toEqual({ ok: false });
    expect(parseTokenCap('abc')).toEqual({ ok: false });
  });
});

describe('buildSettingsUpdate', () => {
  it('sends nothing when the form is unchanged', () => {
    const update = buildSettingsUpdate(formFromSettings(saved), saved);
    expect(update).toEqual({});
    expect(hasChanges(update)).toBe(false);
  });
  it('sends only the changed fields and the typed key', () => {
    const form = { ...formFromSettings(saved), keyInput: ' sk-new ', keyScope: KeyScope.ALL, capInput: '1000' };
    expect(buildSettingsUpdate(form, saved)).toEqual({
      classKey: 'sk-new',
      keyScope: KeyScope.ALL,
      monthlyTokenCapPerStudent: 1000,
    });
  });
  it('sends null to remove the cap', () => {
    const withCap = { ...saved, monthlyTokenCapPerStudent: 500 };
    const form = { ...formFromSettings(withCap), capInput: '' };
    expect(buildSettingsUpdate(form, withCap)).toEqual({ monthlyTokenCapPerStudent: null });
  });
  it('returns null for an invalid cap', () => {
    const form = { ...formFromSettings(saved), capInput: 'x' };
    expect(buildSettingsUpdate(form, saved)).toBeNull();
    expect(hasChanges(null)).toBe(false);
  });
});

describe('usageForSource', () => {
  it('finds the entry of a source', () => {
    const entry = { keySource: KeySource.CLASS, monthTokens: 1, monthCost: null, totalTokens: 2, totalCost: null };
    expect(usageForSource([entry], KeySource.CLASS)).toBe(entry);
    expect(usageForSource([entry], KeySource.STUDENT)).toBeUndefined();
  });
});

describe('providerChangeNeedsKey', () => {
  it('is true when the provider changes, a key is saved and no new key is typed', () => {
    const form = { ...formFromSettings(saved), aiProvider: AiProvider.OPENAI };
    expect(providerChangeNeedsKey(form, saved)).toBe(true);
    expect(providerChangeNeedsKey({ ...form, keyInput: '  ' }, saved)).toBe(true);
  });
  it('is false with a new key, with no provider change, or with no saved key', () => {
    const changed = { ...formFromSettings(saved), aiProvider: AiProvider.OPENAI };
    expect(providerChangeNeedsKey({ ...changed, keyInput: 'sk-new' }, saved)).toBe(false);
    expect(providerChangeNeedsKey(formFromSettings(saved), saved)).toBe(false);
    expect(providerChangeNeedsKey(changed, { ...saved, hasClassKey: false })).toBe(false);
  });
});

describe('classSettingsErrorKey', () => {
  it('maps the refusal for a provider change without a new key', () => {
    expect(classSettingsErrorKey('Send a new Class key when you change the provider')).toBe(
      'classrooms.class_key_provider_needs_key'
    );
  });
  it('gives null for other details', () => {
    expect(classSettingsErrorKey('Something new')).toBeNull();
    expect(classSettingsErrorKey(undefined)).toBeNull();
  });
});

describe('classKeyFormKey', () => {
  it('ignores the feed permission, so a feed save keeps the typed input', () => {
    const other = { ...saved, feedPermission: FeedPermission.STUDENTS_COMMENT };
    expect(classKeyFormKey(other)).toBe(classKeyFormKey(saved));
  });
  it('changes with each class key field', () => {
    const key = classKeyFormKey(saved);
    expect(classKeyFormKey({ ...saved, hasClassKey: false })).not.toBe(key);
    expect(classKeyFormKey({ ...saved, aiProvider: AiProvider.OPENAI })).not.toBe(key);
    expect(classKeyFormKey({ ...saved, keyPriority: KeyPriority.CLASS })).not.toBe(key);
    expect(classKeyFormKey({ ...saved, keyScope: KeyScope.ALL })).not.toBe(key);
    expect(classKeyFormKey({ ...saved, monthlyTokenCapPerStudent: 100 })).not.toBe(key);
  });
});
