'use client';

import { type RefObject, useEffect, useState } from 'react';

import { findScrollParent, pickActiveAnchor, type ScrollspyEntry } from '../utils/examProgress';

/** A section is current once its top is this far from the top of the scroll area. */
const SPY_OFFSET_PX = 96;
const AT_BOTTOM_TOLERANCE_PX = 2;

/**
 * The id of the section that the reader is on. It listens to the nearest scrolling ancestor of `rootRef`,
 * and reads the layout once per frame at most.
 */
export function useScrollspy(rootRef: RefObject<HTMLElement | null>, anchorIds: readonly string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const scroller = findScrollParent(rootRef.current);
    if (!scroller) return;

    let frame = 0;
    const update = (): void => {
      frame = 0;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const entries: ScrollspyEntry[] = anchorIds.flatMap(anchorId => {
        const element = document.getElementById(anchorId);
        return element ? [{ anchorId, top: element.getBoundingClientRect().top - scrollerTop }] : [];
      });
      const isScrollable = scroller.scrollHeight > scroller.clientHeight;
      const isAtBottom =
        isScrollable && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - AT_BOTTOM_TOLERANCE_PX;
      setActiveId(pickActiveAnchor(entries, SPY_OFFSET_PX, isAtBottom));
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [rootRef, anchorIds]);

  return activeId;
}
