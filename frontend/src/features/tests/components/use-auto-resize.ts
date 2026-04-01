'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useAutoResize() {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [resize]);

  return { ref, resize };
}
