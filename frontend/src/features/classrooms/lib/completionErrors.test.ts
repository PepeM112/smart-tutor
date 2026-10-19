import { describe, expect, it } from 'vitest';

import { removeCompletionErrorKey } from './completionErrors';

describe('removeCompletionErrorKey', () => {
  it('maps the known details', () => {
    expect(removeCompletionErrorKey('The best score of the student reaches the pass threshold')).toBe(
      'completion_error_passed'
    );
    expect(removeCompletionErrorKey('The classroom is archived')).toBe('completion_error_archived');
    expect(removeCompletionErrorKey('Completion not found')).toBe('completion_error_not_found');
  });

  it('gives null for other text', () => {
    expect(removeCompletionErrorKey('Boom')).toBeNull();
    expect(removeCompletionErrorKey(undefined)).toBeNull();
  });
});
