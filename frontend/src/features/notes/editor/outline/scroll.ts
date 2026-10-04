// Scroll helpers for the outline. The note page scrolls an inner element (the pane of the split view),
// not the window, so the scroll container must be found from the editor DOM.

const HEADING_SELECTOR = 'h1[id],h2[id],h3[id]';

/** The nearest ancestor that scrolls vertically, or `null` when the page (window) scrolls. */
export function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current && current !== document.body && current !== document.documentElement) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return current;
    current = current.parentElement;
  }
  return null;
}

/** Headings of the editor that have an id (all of them, once the anchors plugin ran). */
export function queryHeadingElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
}

/**
 * The heading with this id. Compared by property, not by a CSS selector: slugs can have
 * characters that need escaping in a selector.
 */
export function findHeadingElement(root: HTMLElement, id: string): HTMLElement | null {
  return queryHeadingElements(root).find(element => element.id === id) ?? null;
}

/** A hidden heading (for example in a closed toggle) has no box and cannot be scrolled to. */
export const isRendered = (element: HTMLElement): boolean => element.getClientRects().length > 0;

export function scrollToHeading(root: HTMLElement, id: string, behavior: ScrollBehavior): boolean {
  const element = findHeadingElement(root, id);
  if (!element || !isRendered(element)) return false;
  // scrollIntoView scrolls the right container and uses `scroll-margin-top` of the heading.
  element.scrollIntoView({ behavior, block: 'start' });
  return true;
}

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Id from `location.hash` (`#my-heading`), decoded. `null` when there is none. */
export function readHashId(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
