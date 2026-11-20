import { type RefObject, useEffect } from 'react';

import { shouldCollapseOutline } from '@/lib/outlineCollapse';
import { selectOutlineWidth, useOutlineStore } from '@/store/useOutlineStore';

import { selectAssistWidth, useAssistPanelStore } from '../store/useAssistPanelStore';

/**
 * The Ask AI sheet and the outline column share the width of the page. When the sheet opens and the reading
 * column would get too narrow, the outline folds. It opens again when the sheet closes, but only if this hook
 * folded it: a column that the user closed stays closed, and one the user reopened stays open.
 */
export function useOutlineAutoCollapse(
  isSheetWanted: boolean,
  groupElementRef: RefObject<HTMLElement | null>,
  pageKey: string
): void {
  // Keyed on the page, not on "has an outline": a move from one outline page to another must re-run the check.
  const activeKey = useOutlineStore(s => s.activeKey);

  useEffect(() => {
    if (activeKey === null) return;
    const outline = useOutlineStore.getState();
    if (!isSheetWanted) {
      outline.autoRestore();
      return;
    }
    const groupWidth = groupElementRef.current?.clientWidth ?? 0;
    const assistWidth = selectAssistWidth(pageKey)(useAssistPanelStore.getState());
    if (groupWidth > 0 && shouldCollapseOutline(groupWidth, assistWidth, selectOutlineWidth(outline))) {
      outline.autoCollapse();
    }
  }, [activeKey, isSheetWanted, groupElementRef, pageKey]);
}
