import { describe, expect, it } from 'vitest';

import { removeCompletionErrorKey } from './completionErrors';

describe('removeCompletionErrorKey', () => {
  it('maps the known codes', () => {
    expect(removeCompletionErrorKey({ code: 'completion_passed' })).toBe('completion_error_passed');
    expect(removeCompletionErrorKey({ code: 'space_archived' })).toBe('completion_error_archived');
    expect(removeCompletionErrorKey({ code: 'completion_not_found' })).toBe('completion_error_not_found');
  });

  it('gives null for other codes or no code', () => {
    expect(removeCompletionErrorKey({ code: 'a_new_code' })).toBeNull();
    expect(removeCompletionErrorKey({ detail: 'Completion not found' })).toBeNull();
    expect(removeCompletionErrorKey(undefined)).toBeNull();
  });
});
