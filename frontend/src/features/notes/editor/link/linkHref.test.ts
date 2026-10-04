import { describe, expect, it } from 'vitest';

import { normalizeLinkHref } from './linkHref';

describe('normalizeLinkHref', () => {
  it('adds https to a bare domain', () => {
    expect(normalizeLinkHref(' example.com/a ')).toBe('https://example.com/a');
  });

  it('keeps schemes, paths and anchors', () => {
    expect(normalizeLinkHref('http://a.dev')).toBe('http://a.dev');
    expect(normalizeLinkHref('mailto:a@b.dev')).toBe('mailto:a@b.dev');
    expect(normalizeLinkHref('/notes/1')).toBe('/notes/1');
    expect(normalizeLinkHref('#top')).toBe('#top');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeLinkHref('   ')).toBe('');
  });
});
