'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type ClickInfo = Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>;

/**
 * The in-app href that a click would open, or null when the click does not leave the page:
 * a modified click (new tab), another target, a download, a link to another site, or the same URL.
 * Another site is left to `beforeunload`.
 */
export function getLeaveHref(event: ClickInfo, target: EventTarget | null, current: URL): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(target instanceof Element)) return null;

  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return null;

  const url = new URL(anchor.href, current);
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname && url.search === current.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

type LeaveGuard = {
  /** The link the user clicked. A confirm dialog is open while it is set. */
  pendingHref: string | null;
  /** Go to the clicked link. */
  confirmLeave: () => void;
  /** Stay on the page. */
  cancelLeave: () => void;
};

/**
 * Asks before the user leaves the page while `isActive`.
 * - Reload, tab close, and a link to another site: the `beforeunload` prompt of the browser.
 * - A click on an in-app link: a capture-phase listener stops it and sets `pendingHref`. The page shows
 *   a `ConfirmDialog` (the App Router has no hook for a route leave).
 * The browser Back button is not blocked.
 */
export function useLeaveGuard(isActive: boolean): LeaveGuard {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Some browsers need a value to show the prompt.
      event.returnValue = '';
    };
    const handleClick = (event: MouseEvent) => {
      const href = getLeaveHref(event, event.target, new URL(window.location.href));
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleClick, true);
    };
  }, [isActive]);

  const confirmLeave = useCallback(() => {
    if (pendingHref) router.push(pendingHref);
  }, [pendingHref, router]);
  const cancelLeave = useCallback(() => setPendingHref(null), []);

  return { pendingHref, confirmLeave, cancelLeave };
}
