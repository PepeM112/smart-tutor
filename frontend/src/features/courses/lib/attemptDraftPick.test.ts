import { describe, expect, it } from 'vitest';

import { pickNewerAnswers } from './attemptDraftPick';

const server = { answers: { q1: 'server' }, savedAt: 1000 };

describe('pickNewerAnswers', () => {
  it('uses the local copy when the server has no draft', () => {
    expect(pickNewerAnswers(null, { answers: { q1: 'local' }, savedAt: 500 })).toEqual({ q1: 'local' });
  });

  it('uses the local copy when it is newer than the server draft', () => {
    expect(pickNewerAnswers(server, { answers: { q1: 'local' }, savedAt: 2000 })).toEqual({ q1: 'local' });
  });

  it('uses the server draft when it is newer or equal', () => {
    expect(pickNewerAnswers(server, { answers: { q1: 'local' }, savedAt: 500 })).toEqual({ q1: 'server' });
    expect(pickNewerAnswers(server, { answers: { q1: 'local' }, savedAt: 1000 })).toEqual({ q1: 'server' });
  });

  it('uses the server draft when the local copy has no timestamp', () => {
    expect(pickNewerAnswers(server, { answers: { q1: 'local' }, savedAt: null })).toEqual({ q1: 'server' });
  });
});
