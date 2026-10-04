// Geometry of the block handle: which top-level block the pointer is on, and where a drop line goes.
// All numbers are in px, relative to the editor container (like `table/tableGeometry.ts`, which gives the `Band` type
// and `gapFromPoint`). The pure functions have no DOM access. `measureBlocks` reads the DOM.

import { topLevelBlocks } from './blockCommands';

import type { Band } from '../table/tableGeometry';
import type { EditorView } from '@tiptap/pm/view';

/**
 * How far left of the block the pointer still counts as "on the block". The handle (+ and grip, 52px) sits
 * left of the block, and a table block shifts it left by the width of the table handle (44px). The pointer is
 * tracked on the window, so the handle can be outside the editor container.
 */
export const BLOCK_HANDLE_REACH = 120;

/** Index of the block under the pointer. The gap between two blocks goes half to each, so there is no dead zone. */
export function blockIndexAt(bands: Band[], y: number): number | null {
  if (bands.length === 0) return null;
  const index = bands.findIndex((band, i) => {
    const next = bands[i + 1];
    const end = band.start + band.size;
    return y < (next ? (end + next.start) / 2 : Infinity);
  });
  return index === -1 ? bands.length - 1 : index;
}

/** Position (y) of the drop line for gap `gap`: in the middle of the space between two blocks. */
export function gapLineOffset(bands: Band[], gap: number): number {
  if (bands.length === 0) return 0;
  if (gap <= 0) return bands[0].start;
  const before = bands[Math.min(gap, bands.length) - 1];
  const beforeEnd = before.start + before.size;
  const after = bands[gap];
  return after ? (beforeEnd + after.start) / 2 : beforeEnd;
}

export type BlockBox = {
  index: number;
  pos: number;
  /** Left edge and top edge, relative to the container. */
  left: number;
  top: number;
  height: number;
  /** Left edge in the viewport. */
  viewportLeft: number;
};

/** Measure the top-level blocks. Gives an empty list when one block has no element (the view is updating). */
export function measureBlocks(view: EditorView, container: DOMRect): BlockBox[] {
  const blocks = topLevelBlocks(view.state.doc);
  const boxes = blocks.flatMap(block => {
    const dom = view.nodeDOM(block.pos);
    if (!(dom instanceof HTMLElement)) return [];
    const rect = dom.getBoundingClientRect();
    // A table sits in a wrapper that can be wider than the table: the handle follows the table itself.
    const left = (block.node.type.name === 'table' ? dom.querySelector('table') : null)?.getBoundingClientRect().left;
    return [
      {
        index: block.index,
        pos: block.pos,
        left: (left ?? rect.left) - container.left,
        top: rect.top - container.top,
        height: rect.height,
        viewportLeft: left ?? rect.left,
      },
    ];
  });
  return boxes.length === blocks.length ? boxes : [];
}

export const boxesToBands = (boxes: BlockBox[]): Band[] => boxes.map(box => ({ start: box.top, size: box.height }));
