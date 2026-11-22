import { describe, expect, it } from 'vitest';

import { spaceErrorKey } from './spaceErrors';

describe('spaceErrorKey', () => {
  it('maps the refusal for a removed course with student results', () => {
    expect(spaceErrorKey({ detail: 'Any text', code: 'removed_course_has_results' })).toBe(
      'classrooms.error_removed_course_has_results'
    );
  });

  it('gives null for other codes or no code', () => {
    expect(spaceErrorKey({ code: 'a_new_code' })).toBeNull();
    expect(spaceErrorKey({ detail: 'A removed course has student results.' })).toBeNull();
    expect(spaceErrorKey(undefined)).toBeNull();
  });
});
