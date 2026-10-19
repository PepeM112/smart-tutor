import { describe, expect, it } from 'vitest';

import { badgeText } from './badge';

describe('badgeText', () => {
  it('shows the count up to 99', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
  });

  it('caps a bigger count at 99+', () => {
    expect(badgeText(100)).toBe('99+');
    expect(badgeText(1234)).toBe('99+');
  });
});
