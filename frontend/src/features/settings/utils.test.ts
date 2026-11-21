import { describe, expect, it } from 'vitest';

import type { AiToolPermissionRead, UserRead } from '@/client';

import {
  applyPermissionDraft,
  buildDailyLimitPatch,
  buildDisplayNamePatch,
  buildEaseFactorPatch,
  parseSettingsTab,
} from './utils';

const server = [
  { name: 'a', kind: 'read', autoApprove: true },
  { name: 'b', kind: 'read', autoApprove: false },
  { name: 'c', kind: 'write', autoApprove: false },
] as AiToolPermissionRead[];

const user = { displayName: 'Jose', dailyReviewLimit: null, initialEaseFactor: 2.5 } as UserRead;

describe('applyPermissionDraft', () => {
  it('puts the changes over the server values', () => {
    expect(applyPermissionDraft(server, { b: true }).map(tool => tool.autoApprove)).toEqual([true, true, false]);
  });
});

describe('buildDisplayNamePatch', () => {
  it('returns null for the saved value', () => {
    expect(buildDisplayNamePatch('Jose', user)).toBeNull();
  });

  it('returns the new name, or null when the field is cleared', () => {
    expect(buildDisplayNamePatch('Pepe', user)).toEqual({ displayName: 'Pepe' });
    expect(buildDisplayNamePatch('', user)).toEqual({ displayName: null });
  });

  it('treats a missing name as an empty field', () => {
    expect(buildDisplayNamePatch('', { ...user, displayName: null })).toBeNull();
  });
});

describe('buildDailyLimitPatch', () => {
  it('returns null for the saved value and for a value that is not a number', () => {
    expect(buildDailyLimitPatch('', user)).toBeNull();
    expect(buildDailyLimitPatch('20', { ...user, dailyReviewLimit: 20 })).toBeNull();
    expect(buildDailyLimitPatch('abc', user)).toBeNull();
  });

  it('returns the limit, or null for no limit', () => {
    expect(buildDailyLimitPatch('30', user)).toEqual({ dailyReviewLimit: 30 });
    expect(buildDailyLimitPatch('', { ...user, dailyReviewLimit: 20 })).toEqual({ dailyReviewLimit: null });
  });
});

describe('buildEaseFactorPatch', () => {
  it('returns null for the saved value and for an empty field', () => {
    expect(buildEaseFactorPatch('2.5', user)).toBeNull();
    expect(buildEaseFactorPatch('', user)).toBeNull();
  });

  it('returns the new value', () => {
    expect(buildEaseFactorPatch('3', user)).toEqual({ initialEaseFactor: 3 });
  });
});

describe('parseSettingsTab', () => {
  it('keeps a valid tab and falls back to profile otherwise', () => {
    expect(parseSettingsTab('srs')).toBe('srs');
    expect(parseSettingsTab('nope')).toBe('profile');
    expect(parseSettingsTab(null)).toBe('profile');
  });
});
