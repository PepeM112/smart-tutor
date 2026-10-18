import { describe, expect, it } from 'vitest';

import { parsePolicyNumber, thresholdToPercent } from './policy';

describe('thresholdToPercent', () => {
  it('turns a fraction into a whole percent', () => {
    expect(thresholdToPercent(0.7)).toBe(70);
    expect(thresholdToPercent(0.333)).toBe(33);
  });

  it('keeps a missing value missing', () => {
    expect(thresholdToPercent(null)).toBeNull();
    expect(thresholdToPercent(undefined)).toBeNull();
  });
});

describe('parsePolicyNumber', () => {
  it('reads an empty field as no limit', () => {
    expect(parsePolicyNumber('  ')).toEqual({ isValid: true, value: null });
  });

  it('accepts a whole number inside the range', () => {
    expect(parsePolicyNumber('3')).toEqual({ isValid: true, value: 3 });
    expect(parsePolicyNumber('100', 100)).toEqual({ isValid: true, value: 100 });
  });

  it('refuses zero, decimals, text and a value above the maximum', () => {
    expect(parsePolicyNumber('0').isValid).toBe(false);
    expect(parsePolicyNumber('1.5').isValid).toBe(false);
    expect(parsePolicyNumber('abc').isValid).toBe(false);
    expect(parsePolicyNumber('101', 100).isValid).toBe(false);
  });
});
