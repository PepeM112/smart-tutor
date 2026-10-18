import { describe, expect, it } from 'vitest';

import { overrideErrorText } from './overrideErrors';

describe('overrideErrorText', () => {
  it('maps the known details', () => {
    expect(overrideErrorText('Grade overrides are only available in classrooms')).toEqual({
      key: 'override_error_not_classroom',
    });
    expect(overrideErrorText('The classroom is archived')).toEqual({ key: 'override_error_archived' });
    expect(overrideErrorText('A teacher graded this answer. It cannot be challenged.')).toEqual({
      key: 'override_error_challenge_refused',
    });
  });

  it('takes the points out of the range text', () => {
    expect(overrideErrorText('The score must be between 0 and 2.5')).toEqual({
      key: 'override_error_range',
      values: { points: '2.5' },
    });
  });

  it('gives null for other text', () => {
    expect(overrideErrorText('Boom')).toBeNull();
    expect(overrideErrorText(undefined)).toBeNull();
  });
});
