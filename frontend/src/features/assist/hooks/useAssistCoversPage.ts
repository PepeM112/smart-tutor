'use client';

import { useBreakpoint } from '@/hooks/useBreakpoint';

import { useAssistPanelStore } from '../store/useAssistPanelStore';

/**
 * True while the Assistant covers the page: on a phone it is a modal drawer.
 * A page must not open its own diff drawer then, or the two drawers stack.
 * The diff opens when the user closes the Assistant ("View changes" also closes it).
 */
export function useAssistCoversPage(): boolean {
  const { isMobile } = useBreakpoint();
  const isOpen = useAssistPanelStore(s => s.isOpen);
  return isMobile && isOpen;
}
