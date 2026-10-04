import { describe, expect, it } from 'vitest';

import { blockIndexAt, gapLineOffset } from './blockGeometry';

// Three blocks: 0..20, 30..70 (gap of 10 above), 100..120 (gap of 30 above).
const BANDS = [
  { start: 0, size: 20 },
  { start: 30, size: 40 },
  { start: 100, size: 20 },
];

describe('blockIndexAt', () => {
  it('gives the block under the pointer', () => {
    expect(blockIndexAt(BANDS, 10)).toBe(0);
    expect(blockIndexAt(BANDS, 50)).toBe(1);
    expect(blockIndexAt(BANDS, 110)).toBe(2);
  });

  it('splits the gap between two blocks at its middle', () => {
    expect(blockIndexAt(BANDS, 24)).toBe(0);
    expect(blockIndexAt(BANDS, 26)).toBe(1);
    expect(blockIndexAt(BANDS, 84)).toBe(1);
    expect(blockIndexAt(BANDS, 86)).toBe(2);
  });

  it('gives the first block above the document and the last block below it', () => {
    expect(blockIndexAt(BANDS, -50)).toBe(0);
    expect(blockIndexAt(BANDS, 900)).toBe(2);
  });

  it('gives null when there are no blocks', () => {
    expect(blockIndexAt([], 10)).toBeNull();
  });
});

describe('gapLineOffset', () => {
  it('puts the line at the start, between the blocks and at the end', () => {
    expect(gapLineOffset(BANDS, 0)).toBe(0);
    expect(gapLineOffset(BANDS, 1)).toBe(25);
    expect(gapLineOffset(BANDS, 2)).toBe(85);
    expect(gapLineOffset(BANDS, 3)).toBe(120);
  });
});
