'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────

type TextNodeEntry = {
  node: Text;
  searchStart: number;
  length: number;
};

type Segment = {
  node: Text;
  localStart: number;
  localEnd: number;
};

// ── Constants ────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

const STYLE_ID = 'ai-edit-highlight-styles';

const HIGHLIGHT_CSS = `
mark[data-ai-highlight] {
  background-color: var(--highlight-ai);
  cursor: pointer;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  line-height: inherit;
  padding: 3px 5px;
  margin: 0 -5px;
}
mark[data-ai-highlight][data-hover],
mark[data-ai-highlight][data-active] {
  background-color: var(--highlight-ai-active);
}
`;

// ── Global style injection ───────────────────────────────────────────

function ensureGlobalStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = HIGHLIGHT_CSS;
  document.head.appendChild(style);
}

// ── DOM utilities ────────────────────────────────────────────────────

function closestBlockAncestor(node: Node, root: HTMLElement): Element {
  let el = node.parentElement;
  while (el && el !== root) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return root;
}

/**
 * Walk every text node inside `container` and build a single searchable
 * string. A `\n` is inserted between text nodes that belong to different
 * block-level ancestors so that cross-paragraph selections can be matched.
 */
function buildSearchableText(container: HTMLElement): { text: string; nodes: TextNodeEntry[] } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: TextNodeEntry[] = [];
  let text = '';
  let prevBlockParent: Element | null = null;

  let current: Text | null;
  // SAFETY: SHOW_TEXT filter guarantees nextNode() returns only Text nodes
  while ((current = walker.nextNode() as Text | null)) {
    const blockParent = closestBlockAncestor(current, container);
    if (prevBlockParent && blockParent !== prevBlockParent) {
      text += '\n';
    }
    prevBlockParent = blockParent;

    const content = current.textContent ?? '';
    nodes.push({ node: current, searchStart: text.length, length: content.length });
    text += content;
  }

  return { text, nodes };
}

// ── Search ───────────────────────────────────────────────────────────

/**
 * Collapse runs of whitespace into a single space and build an index map
 * from normalized positions back to original positions.
 */
function normalizeWhitespace(text: string): { normalized: string; map: number[] } {
  const map: number[] = [];
  let normalized = '';
  let prevSpace = true;

  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (!prevSpace) {
        normalized += ' ';
        map.push(i);
      }
      prevSpace = true;
    } else {
      normalized += text[i];
      map.push(i);
      prevSpace = false;
    }
  }

  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }

  return { normalized, map };
}

/**
 * Find `needle` inside `haystack`. Tries an exact match first, then falls
 * back to whitespace-normalized matching for cross-paragraph selections.
 */
function findMatch(haystack: string, needle: string): { start: number; end: number } | null {
  const exact = haystack.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  const { normalized: normHay, map } = normalizeWhitespace(haystack);
  const normNeedle = needle.replace(/\s+/g, ' ').trim();
  if (!normNeedle) return null;

  const normIdx = normHay.indexOf(normNeedle);
  if (normIdx === -1) return null;

  return {
    start: map[normIdx],
    end: map[normIdx + normNeedle.length - 1] + 1,
  };
}

// ── Segments ─────────────────────────────────────────────────────────

function getSegments(nodes: TextNodeEntry[], matchStart: number, matchEnd: number): Segment[] {
  const segments: Segment[] = [];

  for (const { node, searchStart, length } of nodes) {
    const nodeEnd = searchStart + length;
    if (nodeEnd <= matchStart || searchStart >= matchEnd) continue;

    const localStart = Math.max(0, matchStart - searchStart);
    const localEnd = Math.min(length, matchEnd - searchStart);
    if (localStart >= localEnd) continue;

    segments.push({ node, localStart, localEnd });
  }

  return segments;
}

// ── Highlight application / removal ──────────────────────────────────

function setHoverOnGroup(marks: HTMLElement[], hover: boolean): void {
  marks.forEach(m => {
    if (hover) m.setAttribute('data-hover', '');
    else m.removeAttribute('data-hover');
  });
}

function applyHighlights(
  segments: Segment[],
  highlightIndex: number,
  groupMarks: HTMLElement[],
  onClick: () => void
): HTMLElement[] {
  const marks: HTMLElement[] = [];

  for (let i = segments.length - 1; i >= 0; i--) {
    const { node, localStart, localEnd } = segments[i];
    let target: Text = node;

    if (localEnd < target.length) target.splitText(localEnd);
    if (localStart > 0) target = target.splitText(localStart);

    const mark = document.createElement('mark');
    mark.setAttribute('data-ai-highlight', '');
    mark.setAttribute('data-highlight-index', String(highlightIndex));
    mark.addEventListener('click', onClick);
    mark.addEventListener('mouseenter', () => setHoverOnGroup(groupMarks, true));
    mark.addEventListener('mouseleave', () => setHoverOnGroup(groupMarks, false));
    target.parentNode!.replaceChild(mark, target);
    mark.appendChild(target);
    marks.push(mark);
  }

  groupMarks.push(...marks);
  return marks;
}

function removeHighlights(marks: HTMLElement[]): void {
  const parents = new Set<Node>();
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parents.add(parent);
  }
  parents.forEach(p => {
    if (p instanceof Element) p.normalize();
  });
}

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * Highlights multiple texts inside the DOM tree rooted at `containerRef`.
 * Each highlighted region is clickable (calls `onClick(index)`). The region
 * at `activeIndex` gets an accent color; the rest use a default yellow.
 *
 * Highlights are applied via direct DOM manipulation and are safe as long
 * as the container's React subtree doesn't re-render while they're active.
 */
export function useTextHighlight(
  containerRef: React.RefObject<HTMLElement | null>,
  texts: string[],
  activeIndex: number | null,
  onClick: (index: number) => void
): void {
  const marksMapRef = useRef<Map<number, HTMLElement[]>>(new Map());
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  });

  const textsKey = JSON.stringify(texts);

  useLayoutEffect(() => {
    const marksMap = marksMapRef.current;
    marksMap.forEach(marks => removeHighlights(marks));
    marksMap.clear();

    const container = containerRef.current;
    if (!container || texts.length === 0) return;

    ensureGlobalStyles();

    const { text: searchable, nodes } = buildSearchableText(container);

    const matches: { index: number; start: number; end: number }[] = [];
    texts.forEach((t, i) => {
      const match = findMatch(searchable, t);
      if (match) matches.push({ index: i, ...match });
    });

    // Process from end-to-start so earlier text nodes aren't invalidated by splits
    matches.sort((a, b) => b.start - a.start);

    for (const { index, start, end } of matches) {
      const segments = getSegments(nodes, start, end);
      const groupMarks: HTMLElement[] = [];
      applyHighlights(segments, index, groupMarks, () => onClickRef.current(index));
      marksMap.set(index, groupMarks);
    }

    return () => {
      marksMap.forEach(marks => removeHighlights(marks));
      marksMap.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textsKey is the stable serialization of texts
  }, [textsKey, containerRef]);

  // Toggle active styling without re-applying highlights
  useEffect(() => {
    marksMapRef.current.forEach((marks, idx) => {
      const isActive = idx === activeIndex;
      marks.forEach(m => {
        if (isActive) m.setAttribute('data-active', '');
        else m.removeAttribute('data-active');
      });
    });
  }, [activeIndex]);
}
