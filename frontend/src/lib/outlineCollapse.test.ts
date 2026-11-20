import { describe, expect, it } from 'vitest';

import { shouldCollapseOutline } from './outlineCollapse';

describe('shouldCollapseOutline', () => {
  it('collapses when the reading column would be under 600px', () => {
    // 1048 - 340 - 12 - 264 = 432
    expect(shouldCollapseOutline(1048, 340, 264)).toBe(true);
  });

  it('keeps the outline when the reading column is wider than 600px', () => {
    // 1600 - 340 - 12 - 264 = 984
    expect(shouldCollapseOutline(1600, 340, 264)).toBe(false);
  });

  it('keeps the outline at exactly 600px', () => {
    // 1216 - 340 - 12 - 264 = 600
    expect(shouldCollapseOutline(1216, 340, 264)).toBe(false);
  });

  it('collapses at 1px under the limit', () => {
    expect(shouldCollapseOutline(1215, 340, 264)).toBe(true);
  });

  it('counts a wider outline and a wider Ask AI sheet', () => {
    expect(shouldCollapseOutline(1250, 340, 264)).toBe(false);
    expect(shouldCollapseOutline(1250, 400, 264)).toBe(true);
    expect(shouldCollapseOutline(1250, 340, 320)).toBe(true);
  });
});
