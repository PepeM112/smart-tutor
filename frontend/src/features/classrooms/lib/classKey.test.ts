import { describe, expect, it } from 'vitest';

import { AiProvider, type ClassroomSettingsRead, FeedPermission, KeyPriority, KeyScope, KeySource } from '@/client';

import { buildSettingsUpdate, formFromSettings, hasChanges, parseTokenCap, usageForSource } from './classKey';

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
