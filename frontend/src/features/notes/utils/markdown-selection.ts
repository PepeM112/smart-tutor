// ── Selection → markdown range via source position annotations ──────

function findAnnotatedAncestor(node: Node, container: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el && el !== container) {
    if (el.hasAttribute('data-md-start')) return el;
    el = el.parentElement;
  }
  return null;
}

export type MarkdownRange = { start: number; end: number; markdown: string };

export function getMarkdownRangeFromSelection(
  container: HTMLElement,
  content: string,
): MarkdownRange | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return null;
  if (!container.contains(sel.anchorNode) || !container.contains(sel.focusNode)) return null;

  const anchorEl = findAnnotatedAncestor(sel.anchorNode, container);
  const focusEl = findAnnotatedAncestor(sel.focusNode, container);
  if (!anchorEl || !focusEl) return null;

  const starts = [
    Number(anchorEl.getAttribute('data-md-start')),
    Number(focusEl.getAttribute('data-md-start')),
  ];
  const ends = [
    Number(anchorEl.getAttribute('data-md-end')),
    Number(focusEl.getAttribute('data-md-end')),
  ];

  const start = Math.min(...starts);
  const end = Math.max(...ends);

  if (isNaN(start) || isNaN(end) || start >= end || end > content.length) return null;

  return { start, end, markdown: content.slice(start, end) };
}
