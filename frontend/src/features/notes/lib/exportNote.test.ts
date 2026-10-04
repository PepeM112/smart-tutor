// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportNote, noteFileName } from './exportNote';

describe('noteFileName', () => {
  it('keeps non-ASCII letters', () => {
    expect(noteFileName('Café')).toBe('Café.md');
    expect(noteFileName('日本語のノート')).toBe('日本語のノート.md');
  });

  it('removes characters that file systems reject', () => {
    expect(noteFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij.md');
  });

  it('removes control characters', () => {
    expect(noteFileName('line\none\ttwo')).toBe('lineonetwo.md');
  });

  it('uses a fallback name when nothing is left', () => {
    expect(noteFileName('')).toBe('note.md');
    expect(noteFileName(' / ? ')).toBe('note.md');
  });
});

describe('exportNote', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // In afterEach, so a failed assertion does not leave the stubbed `URL` for the next test.
    vi.unstubAllGlobals();
  });

  it('revokes the object URL after the click, not before', () => {
    vi.useFakeTimers();
    const createUrl = vi.fn(() => 'blob:test');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    exportNote('Café', '# Hi');

    expect(click).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith('blob:test');
  });
});
