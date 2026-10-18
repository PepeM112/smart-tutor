import { describe, expect, it } from 'vitest';

import { type AiKeyStatusRead, KeyStatus } from '@/client';

import { keyNoticeKind } from './keyNotice';

const status = (patch: Partial<AiKeyStatusRead>): AiKeyStatusRead => ({
  status: KeyStatus.CLASS,
  capReached: false,
  tokensUsedThisMonth: 0,
  monthlyTokenCap: null,
  ...patch,
});

describe('keyNoticeKind', () => {
  it('says nothing while the data is loading or for teachers', () => {
    expect(keyNoticeKind(undefined, true)).toBeNull();
    expect(keyNoticeKind(status({ status: KeyStatus.NONE }), false)).toBeNull();
  });
  it('says nothing when the Class key pays', () => {
    expect(keyNoticeKind(status({}), true)).toBeNull();
  });
  it('warns about the own key and about no key', () => {
    expect(keyNoticeKind(status({ status: KeyStatus.STUDENT }), true)).toBe('student');
    expect(keyNoticeKind(status({ status: KeyStatus.NONE }), true)).toBe('none');
  });
  it('puts a reached cap first', () => {
    expect(keyNoticeKind(status({ status: KeyStatus.STUDENT, capReached: true }), true)).toBe('cap_reached');
  });
});
