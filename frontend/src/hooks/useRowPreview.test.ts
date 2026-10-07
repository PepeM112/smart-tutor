// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRowPreview } from './useRowPreview';

const A = { id: 'a' };
const B = { id: 'b' };

describe('useRowPreview', () => {
  it('shows the row that was opened', () => {
    const { result } = renderHook(() => useRowPreview([A, B]));
    act(() => result.current.openPreview('b'));
    expect(result.current.previewItem).toBe(B);
    expect(result.current.previewId).toBe('b');
  });

  it('closes on request', () => {
    const { result } = renderHook(() => useRowPreview([A, B]));
    act(() => result.current.openPreview('a'));
    act(() => result.current.closePreview());
    expect(result.current.previewItem).toBeNull();
  });

  // Regression: the pane hid when its row left the page, but the id stayed, so the pane opened again later.
  it('does not reopen when the row comes back', () => {
    const { result, rerender } = renderHook(({ items }) => useRowPreview(items), {
      initialProps: { items: [A, B] },
    });
    act(() => result.current.openPreview('a'));

    rerender({ items: [B] });
    expect(result.current.previewItem).toBeNull();

    rerender({ items: [A, B] });
    expect(result.current.previewItem).toBeNull();
    expect(result.current.previewId).toBeNull();
  });

  it('clears the id while the list is empty (loading)', () => {
    const { result, rerender } = renderHook(({ items }) => useRowPreview(items), {
      initialProps: { items: [A] },
    });
    act(() => result.current.openPreview('a'));
    rerender({ items: [] });
    rerender({ items: [A] });
    expect(result.current.previewItem).toBeNull();
  });

  it('clears the id when the reset key changes, even if the row is still listed', () => {
    const { result, rerender } = renderHook(({ resetKey }) => useRowPreview([A, B], resetKey), {
      initialProps: { resetKey: 'page-1' },
    });
    act(() => result.current.openPreview('a'));
    expect(result.current.previewItem).toBe(A);

    rerender({ resetKey: 'page-2' });
    expect(result.current.previewItem).toBeNull();

    // Back to the first key: the old id must not come back.
    rerender({ resetKey: 'page-1' });
    expect(result.current.previewItem).toBeNull();
  });

  it('keeps the row when other rows change', () => {
    const { result, rerender } = renderHook(({ items }) => useRowPreview(items), {
      initialProps: { items: [A, B] },
    });
    act(() => result.current.openPreview('a'));
    rerender({ items: [A] });
    expect(result.current.previewItem).toBe(A);
  });
});
