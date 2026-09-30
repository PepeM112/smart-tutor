import { describe, expect, it } from 'vitest';

import { displayTitle } from './displayTitle';

const t = (): string => 'Untitled';

describe('displayTitle', () => {
  it('returns the title when it has text', () => {
    expect(displayTitle('My note', t)).toBe('My note');
  });

  it('trims the title', () => {
    expect(displayTitle('  My note  ', t)).toBe('My note');
  });

  it('falls back to the untitled label for an empty title', () => {
    expect(displayTitle('', t)).toBe('Untitled');
  });

  it('falls back to the untitled label for a whitespace-only title', () => {
    expect(displayTitle('   ', t)).toBe('Untitled');
  });

  it('falls back to the untitled label for a missing title', () => {
    expect(displayTitle(undefined, t)).toBe('Untitled');
    expect(displayTitle(null, t)).toBe('Untitled');
  });
});
