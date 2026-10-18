import { describe, expect, it } from 'vitest';

import { assistRefusalKey } from './assistErrors';

describe('assistRefusalKey', () => {
  it('maps the course test refusal', () => {
    expect(assistRefusalKey('The assistant is not available during a course test')).toBe('unavailable_in_course_test');
  });

  it('maps the AI key and budget errors', () => {
    expect(assistRefusalKey('AI is not configured. Please add your API key in Settings.')).toBe('ai_not_configured');
    expect(
      assistRefusalKey(
        'The AI budget of this classroom is used up for this month. Add your own API key in Settings to continue.'
      )
    ).toBe('ai_budget_used_up');
  });

  it('gives null for other text', () => {
    expect(assistRefusalKey('Something else')).toBeNull();
    expect(assistRefusalKey(undefined)).toBeNull();
    expect(assistRefusalKey('toString')).toBeNull();
  });
});
