'use client';

import { useBreakpoint } from '@/hooks/useBreakpoint';

import { useAssistPanelStore } from '../store/useAssistPanelStore';

/**
 * True while the Assistant covers the page: below `lg` it is a full-screen dialog.
 * A page must not open its own diff drawer then, or the two stack.
 * The diff opens when the user closes the Assistant ("View changes" also closes it).
 */
export function useAssistCoversPage(): boolean {
  const { isDesktop } = useBreakpoint();
  const isOpen = useAssistPanelStore(s => s.isOpen);
  return !isDesktop && isOpen;
}
