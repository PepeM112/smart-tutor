import { describe, expect, it } from 'vitest';

import { authorName, isEdited } from './feedItem';

describe('isEdited', () => {
  const created = new Date('2026-05-01T10:00:00Z');

  it('is false when both times are equal', () => {
    expect(isEdited({ createdAt: created, updatedAt: new Date(created) })).toBe(false);
  });

  it('is true when the item changed later', () => {
    expect(isEdited({ createdAt: created, updatedAt: new Date('2026-05-01T10:05:00Z') })).toBe(true);
  });
});

describe('authorName', () => {
  it('prefers the display name', () => {
    expect(authorName({ displayName: 'Ana Ruiz', username: 'ana' })).toBe('Ana Ruiz');
  });

  it('falls back to the username for a null or empty display name', () => {
    expect(authorName({ displayName: null, username: 'ana' })).toBe('ana');
    expect(authorName({ displayName: '', username: 'ana' })).toBe('ana');
  });
});
