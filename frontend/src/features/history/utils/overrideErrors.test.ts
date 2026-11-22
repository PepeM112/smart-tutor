import { describe, expect, it } from 'vitest';

import { overrideErrorText } from './overrideErrors';

describe('overrideErrorText', () => {
  it('maps the known codes', () => {
    expect(overrideErrorText({ code: 'override_not_classroom' })).toEqual({ key: 'override_error_not_classroom' });
    expect(overrideErrorText({ code: 'space_archived' })).toEqual({ key: 'override_error_archived' });
    expect(overrideErrorText({ code: 'answer_overridden' })).toEqual({ key: 'override_error_challenge_refused' });
  });

  it('takes the points from the structured field', () => {
    expect(overrideErrorText({ code: 'override_score_out_of_range', maxPoints: 2.5 })).toEqual({
      key: 'override_error_range',
      values: { points: '2.5' },
    });
  });

  it('gives null for the range code without points, other codes or no code', () => {
    expect(overrideErrorText({ code: 'override_score_out_of_range' })).toBeNull();
    expect(overrideErrorText({ code: 'a_new_code' })).toBeNull();
    expect(overrideErrorText({ detail: 'Boom' })).toBeNull();
    expect(overrideErrorText(undefined)).toBeNull();
  });
});
