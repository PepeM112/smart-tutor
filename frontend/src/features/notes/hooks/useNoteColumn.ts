'use client';

import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

import { useNoteWidth } from './useNoteWidth';

/** Width state of the note column. Only desktop has room for a full-width column: smaller screens always fill the page. */
export function useNoteColumn(): { isDesktop: boolean; isFullWidth: boolean; toggleWidth: () => void } {
  const { isDesktop } = useBreakpoint();
  const { width, toggleWidth } = useNoteWidth();
  return { isDesktop, isFullWidth: isDesktop && width === 'full', toggleWidth };
}

/** Classes of the centered note column (editable and trashed view). Callers add their own vertical padding. */
export const noteColumnClass = (isFullWidth: boolean): string =>
  cn('mx-auto w-full px-4 md:px-6', isFullWidth ? 'max-w-none md:px-12' : 'max-w-[720px]');
