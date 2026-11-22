import { describe, expect, it } from 'vitest';

import { parseSSEEvent } from './sseEvents';

describe('parseSSEEvent error events', () => {
  it('keeps the message and the code', () => {
    expect(parseSSEEvent('error', { message: 'Boom', code: 'ai_not_configured' })).toEqual({
      event: 'error',
      data: { message: 'Boom', code: 'ai_not_configured' },
    });
  });

  it('gives an empty message when the body has no text', () => {
    expect(parseSSEEvent('error', {})).toEqual({ event: 'error', data: { message: '' } });
    expect(parseSSEEvent('error', { message: 42 })).toEqual({ event: 'error', data: { message: '' } });
    expect(parseSSEEvent('error', null)).toEqual({ event: 'error', data: { message: '' } });
  });

  it('keeps the code when the message is missing', () => {
    expect(parseSSEEvent('error', { code: 'ai_budget_used_up' })).toEqual({
      event: 'error',
      data: { message: '', code: 'ai_budget_used_up' },
    });
  });

  it('ignores a code that is not a string', () => {
    expect(parseSSEEvent('error', { message: 'x', code: 5 })).toEqual({ event: 'error', data: { message: 'x' } });
  });
});
