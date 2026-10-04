import { describe, expect, it } from 'vitest';

import type { AiToolPermissionRead } from '@/client';

import { applyPermissionDraft, buildPermissionsPayload, mergePermissionDraft } from './utils';

const server = [
  { name: 'a', kind: 'read', autoApprove: true },
  { name: 'b', kind: 'read', autoApprove: false },
  { name: 'c', kind: 'write', autoApprove: false },
] as AiToolPermissionRead[];

describe('mergePermissionDraft', () => {
  it('keeps a change that differs from the server', () => {
    expect(mergePermissionDraft(server, {}, { b: true })).toEqual({ b: true });
  });

  it('removes a change that goes back to the server value', () => {
    expect(mergePermissionDraft(server, { b: true }, { b: false })).toEqual({});
  });

  it('merges several changes with the old draft', () => {
    expect(mergePermissionDraft(server, { b: true }, { a: false, c: true })).toEqual({ a: false, b: true, c: true });
  });
});

describe('applyPermissionDraft', () => {
  it('puts the draft over the server values', () => {
    expect(applyPermissionDraft(server, { b: true }).map(tool => tool.autoApprove)).toEqual([true, true, false]);
  });
});

describe('buildPermissionsPayload', () => {
  it('returns an empty object when nothing differs', () => {
    expect(buildPermissionsPayload(server, {})).toEqual({});
    expect(buildPermissionsPayload(server, { a: true })).toEqual({});
  });

  it('returns only the changed keys', () => {
    expect(buildPermissionsPayload(server, { a: true, b: true })).toEqual({ b: true });
  });
});
