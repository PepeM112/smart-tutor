'use client';

import { useSyncExternalStore } from 'react';

const MOBILE_MAX = 768;
const TABLET_MAX = 1024;
const XL_MIN = 1280;

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const QUERIES = [
  `(max-width: ${MOBILE_MAX - 1}px)`,
  `(min-width: ${MOBILE_MAX}px) and (max-width: ${TABLET_MAX - 1}px)`,
  `(min-width: ${XL_MIN}px)`,
];

export function useBreakpoint() {
  // `useSyncExternalStore` reads the width during render. A component that mounts after hydration (a client
  // navigation) gets the real value in its first render, so it does not show the desktop layout for one frame.
  // On the server and during hydration the value is the desktop one, as before.
  const breakpoint = useSyncExternalStore(subscribe, getBreakpoint, (): Breakpoint => 'desktop');
  const isXl = useSyncExternalStore(subscribe, getIsXl, () => true);

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isXl,
  };
}

/** Calls `onChange` when the width crosses a breakpoint. */
function subscribe(onChange: () => void): () => void {
  const queries = QUERIES.map(query => window.matchMedia(query));
  queries.forEach(query => query.addEventListener('change', onChange));
  return () => queries.forEach(query => query.removeEventListener('change', onChange));
}

function getBreakpoint(): Breakpoint {
  const width = window.innerWidth;
  if (width < MOBILE_MAX) return 'mobile';
  if (width < TABLET_MAX) return 'tablet';
  return 'desktop';
}

function getIsXl(): boolean {
  return window.innerWidth >= XL_MIN;
}
