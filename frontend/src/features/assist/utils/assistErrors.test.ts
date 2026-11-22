import { describe, expect, it } from 'vitest';

import { assistRefusalKey } from './assistErrors';

describe('assistRefusalKey', () => {
  it('maps the course test refusal', () => {
    expect(assistRefusalKey({ detail: 'Any text', code: 'assist_blocked_by_course_test' })).toBe(
      'unavailable_in_course_test'
    );
  });

  it('maps the AI key and budget errors, also from a stream event', () => {
    expect(assistRefusalKey({ message: 'Any text', code: 'ai_not_configured' })).toBe('ai_not_configured');
    expect(assistRefusalKey({ message: 'Any text', code: 'ai_key_unreadable' })).toBe('ai_key_unreadable');
    expect(assistRefusalKey({ message: 'Any text', code: 'ai_budget_used_up' })).toBe('ai_budget_used_up');
  });

  it('gives null for other codes, text only or no body', () => {
    expect(assistRefusalKey({ code: 'a_new_code' })).toBeNull();
    expect(assistRefusalKey({ message: 'AI is not configured. Please add your API key in Settings.' })).toBeNull();
    expect(assistRefusalKey({ code: 'toString' })).toBeNull();
    expect(assistRefusalKey(undefined)).toBeNull();
  });
});
