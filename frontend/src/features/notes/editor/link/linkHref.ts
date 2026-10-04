// Helpers for the link popover: URL cleanup and the "open" action.

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Clean a URL typed by the user. A bare domain ("example.com") gets `https://`.
 * Relative paths ("/notes/1"), anchors ("#top"), `mailto:` and other schemes stay as they are.
 */
export function normalizeLinkHref(input: string): string {
  const href = input.trim();
  if (!href) return '';
  if (HAS_SCHEME.test(href) || href.startsWith('/') || href.startsWith('#')) return href;
  return `https://${href}`;
}

/** Open a link in a new tab. `noopener` stops the new page from reaching `window.opener`. */
export function openLink(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer');
}
