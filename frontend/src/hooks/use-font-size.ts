'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

import {
  DEFAULT_FONT_SIZE_ID,
  FONT_SIZE_COOKIE,
  FONT_SIZE_STORAGE_KEY,
  fontSizes,
  getFontSizeValue,
  type FontSizeId,
} from '@/lib/font-size';

interface FontSizeContextValue {
  fontSizeId: FontSizeId;
  setFontSize: (id: FontSizeId) => void;
}

export const FontSizeContext = createContext<FontSizeContextValue>({
  fontSizeId: DEFAULT_FONT_SIZE_ID,
  setFontSize: () => {},
});

function readStoredFontSize(): FontSizeId {
  // SAFETY: setFontSize only writes valid FontSizeId values; the .some() check below handles stale/tampered values
  const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY) as FontSizeId | null;
  return stored && fontSizes.some(f => f.id === stored) ? stored : DEFAULT_FONT_SIZE_ID;
}

const subscribers = new Set<() => void>();
let currentFontSize: FontSizeId | undefined;

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot(): FontSizeId {
  currentFontSize ??= readStoredFontSize();
  return currentFontSize;
}

function getServerSnapshot(): FontSizeId {
  return DEFAULT_FONT_SIZE_ID;
}

function setFontSizeCookie(id: FontSizeId): void {
  const maxAge = 365 * 24 * 60 * 60;
  const value = id === DEFAULT_FONT_SIZE_ID ? '' : id;
  document.cookie = `${FONT_SIZE_COOKIE}=${value};path=/;max-age=${value ? maxAge : 0};SameSite=Lax`;
}

export function useFontSizeProvider(): FontSizeContextValue {
  const fontSizeId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setFontSize = useCallback((id: FontSizeId) => {
    if (!fontSizes.some(f => f.id === id)) return;

    currentFontSize = id;
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, id);
    // Cookie lets layout.tsx set the font size server-side before hydration
    setFontSizeCookie(id);

    document.documentElement.style.fontSize = getFontSizeValue(id);

    subscribers.forEach(cb => cb());
  }, []);

  return { fontSizeId, setFontSize };
}

export function useFontSize(): FontSizeContextValue {
  return useContext(FontSizeContext);
}
