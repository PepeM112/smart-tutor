'use client';

import { useEffect, useState } from 'react';

const MOBILE_MAX = 768;
const TABLET_MAX = 1024;
const XL_MIN = 1280;

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < MOBILE_MAX) return 'mobile';
  if (width < TABLET_MAX) return 'tablet';
  return 'desktop';
}

function getIsXl(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= XL_MIN;
}

export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');
  const [isXl, setIsXl] = useState(true);

  useEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MAX - 1}px)`);
    const tabletQuery = window.matchMedia(`(min-width: ${MOBILE_MAX}px) and (max-width: ${TABLET_MAX - 1}px)`);
    const xlQuery = window.matchMedia(`(min-width: ${XL_MIN}px)`);

    function update() {
      setBreakpoint(getBreakpoint());
      setIsXl(getIsXl());
    }

    update();
    mobileQuery.addEventListener('change', update);
    tabletQuery.addEventListener('change', update);
    xlQuery.addEventListener('change', update);
    return () => {
      mobileQuery.removeEventListener('change', update);
      tabletQuery.removeEventListener('change', update);
      xlQuery.removeEventListener('change', update);
    };
  }, []);

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isXl,
  };
}
