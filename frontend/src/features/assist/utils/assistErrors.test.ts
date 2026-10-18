import { describe, expect, it } from 'vitest';

import { assistRefusalKey } from './assistErrors';

describe('assistRefusalKey', () => {
  it('maps the course test refusal', () => {
    expect(assistRefusalKey('The assistant is not available during a course test')).toBe('unavailable_in_course_test');
  });

  it('gives null for other text', () => {
    expect(assistRefusalKey('Something else')).toBeNull();
    expect(assistRefusalKey(undefined)).toBeNull();
  });
});
