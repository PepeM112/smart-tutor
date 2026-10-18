import { describe, expect, it } from 'vitest';

import { spaceErrorKey } from './spaceErrors';

describe('spaceErrorKey', () => {
  it('maps the refusal for a removed course with student results', () => {
    expect(spaceErrorKey('A removed course has student results. Delete the course forever first.')).toBe(
      'classrooms.error_removed_course_has_results'
    );
  });

  it('gives null for other or missing details', () => {
    expect(spaceErrorKey('Something new')).toBeNull();
    expect(spaceErrorKey(undefined)).toBeNull();
  });
});
