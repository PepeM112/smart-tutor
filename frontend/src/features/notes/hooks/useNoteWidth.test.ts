// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createWidthStore } from './useNoteWidth';

beforeEach(() => localStorage.clear());

describe('createWidthStore', () => {
  it('starts with the default of its own store', () => {
    const useReading = createWidthStore('test-a', 'reading');
    const useFull = createWidthStore('test-b', 'full');

    expect(renderHook(() => useReading()).result.current.width).toBe('reading');
    expect(renderHook(() => useFull()).result.current.width).toBe('full');
  });

  it('keeps one key apart from another and saves the choice', () => {
    const useFirst = createWidthStore('test-c', 'reading');
    const useSecond = createWidthStore('test-d', 'reading');
    const first = renderHook(() => useFirst());
    const second = renderHook(() => useSecond());

    act(() => first.result.current.toggleWidth());

    expect(first.result.current.width).toBe('full');
    expect(second.result.current.width).toBe('reading');
    expect(localStorage.getItem('test-c')).toBe('full');
    expect(localStorage.getItem('test-d')).toBeNull();
  });

  it('reads a saved value that differs from the default', () => {
    localStorage.setItem('test-e', 'reading');
    const useStore = createWidthStore('test-e', 'full');

    expect(renderHook(() => useStore()).result.current.width).toBe('reading');
  });
});
