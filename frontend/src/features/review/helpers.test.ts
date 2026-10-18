import { describe, expect, it } from 'vitest';

import { REVIEW_SCOPE_ALL, reviewScopeOptions, resolveReviewScope } from './helpers';

const labels = { all: 'All', personal: 'Personal' };

describe('reviewScopeOptions', () => {
  it('has All and Personal when there are no courses', () => {
    expect(reviewScopeOptions([], labels).map(o => o.value)).toEqual(['all', 'personal']);
  });

  it('adds only the courses with Include in Review on, with the course title', () => {
    const options = reviewScopeOptions(
      [
        { id: 'c1', title: 'Spanish', includeInSrs: true },
        { id: 'c2', title: 'Biology', includeInSrs: false },
        { id: 'c3', title: 'Unknown' },
      ],
      labels
    );
    expect(options).toEqual([
      { value: 'all', label: 'All' },
      { value: 'personal', label: 'Personal' },
      { value: 'c1', label: 'Spanish' },
    ]);
  });
});

describe('resolveReviewScope', () => {
  const options = reviewScopeOptions([{ id: 'c1', title: 'Spanish', includeInSrs: true }], labels);

  it('keeps a scope that is an option', () => {
    expect(resolveReviewScope('c1', options)).toBe('c1');
    expect(resolveReviewScope('personal', options)).toBe('personal');
  });

  it('falls back to All for a course that is no longer an option', () => {
    expect(resolveReviewScope('gone', options)).toBe(REVIEW_SCOPE_ALL);
  });
});
