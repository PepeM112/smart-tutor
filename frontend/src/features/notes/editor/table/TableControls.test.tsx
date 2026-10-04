// @vitest-environment jsdom

// Integration test of the column / row grips: a real Tiptap editor, the real overlay and a pointer drag.
// jsdom has no layout, so `getBoundingClientRect` returns a fixed grid (3 columns x 3 rows) and
// jsdom has no pointer capture, so the moves and the release are sent to the grip, like a captured pointer.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNoteTableExtensions } from './noteTable';
import { TableControls } from './TableControls';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

// ─── fixed geometry ─────────────────────────────────────────────────────────

const TABLE = { left: 40, top: 40 };
const COL = 100;
const ROW = 30;

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON: () => ({}),
});

function geometry(this: Element): DOMRect {
  const table = this.closest('table');
  if (this instanceof HTMLTableCellElement && table) {
    const rowIndex = Array.from(table.rows).indexOf(this.parentElement as HTMLTableRowElement);
    return rect(TABLE.left + this.cellIndex * COL, TABLE.top + rowIndex * ROW, COL, ROW);
  }
  if (this instanceof HTMLTableRowElement && table) {
    const rowIndex = Array.from(table.rows).indexOf(this);
    return rect(TABLE.left, TABLE.top + rowIndex * ROW, table.rows[0].cells.length * COL, ROW);
  }
  const inner = this instanceof HTMLTableElement ? this : this.querySelector(':scope > table');
  if (inner instanceof HTMLTableElement) {
    return rect(TABLE.left, TABLE.top, inner.rows[0].cells.length * COL, inner.rows.length * ROW);
  }
  return rect(0, 0, 800, 600);
}

// ─── setup ──────────────────────────────────────────────────────────────────

const TABLE_HTML =
  '<p>Intro</p><table>' +
  '<tr><th><p>A</p></th><th><p>B</p></th><th><p>C</p></th></tr>' +
  '<tr><td><p>1</p></td><td><p>2</p></td><td><p>3</p></td></tr>' +
  '<tr><td><p>4</p></td><td><p>5</p></td><td><p>6</p></td></tr>' +
  '</table>';

let editor: Editor;

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(geometry);
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    hasPointerCapture: () => true,
  });
});

afterEach(() => {
  cleanup();
  editor?.destroy();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount() {
  const container = document.createElement('div');
  const editorHost = document.createElement('div');
  const overlayHost = document.createElement('div');
  container.append(editorHost, overlayHost);
  document.body.append(container);

  editor = new Editor({
    element: editorHost,
    extensions: [StarterKit, ...createNoteTableExtensions()],
    content: TABLE_HTML,
  });
  render(
    <Tooltip.Provider>
      <TableControls editor={editor} containerRef={{ current: container }} />
    </Tooltip.Provider>,
    { container: overlayHost }
  );
}

/** Let the overlay measure (it measures in `requestAnimationFrame`) and React render. */
const frame = () => act(() => new Promise(resolve => setTimeout(resolve, 5)));

const pointer = (x: number, y: number) => ({ button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });

/** Hover a point, then press the grip, move to `to` (in steps, a frame between each) and release. */
async function drag(label: string, hover: { x: number; y: number }, to: { x: number; y: number }) {
  fireEvent.pointerMove(window, pointer(hover.x, hover.y));
  await frame();
  const grip = screen.getByRole('button', { name: label });

  fireEvent.pointerDown(grip, pointer(hover.x, hover.y));
  await frame();
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    const x = hover.x + ((to.x - hover.x) * i) / steps;
    const y = hover.y + ((to.y - hover.y) * i) / steps;
    // With pointer capture the moves come to the grip. They bubble to the window (the overlay tracks them).
    // `buttons: 1`: the button is held. A move with no button pressed ends the gesture (a lost release).
    fireEvent.pointerMove(grip, { ...pointer(x, y), buttons: 1 });
    await frame();
  }
  fireEvent.pointerUp(grip, pointer(to.x, to.y));
  await frame();
}

const rowText = (index: number): string[] =>
  Array.from(editor.view.dom.querySelectorAll('tr')[index]?.querySelectorAll('th, td') ?? []).map(
    cell => cell.textContent ?? ''
  );

describe('TableControls: drag a grip', () => {
  it('moves the first column to the end', async () => {
    mount();
    // Column 0: center x = 90, top border y = 40.
    await drag('table_column_handle', { x: 90, y: 45 }, { x: 320, y: 45 });
    expect(rowText(0)).toEqual(['B', 'C', 'A']);
    expect(rowText(1)).toEqual(['2', '3', '1']);
  });

  // Regression: the pointer down on the trigger of an open menu makes Radix close the menu. That close
  // unlocked the overlay, the grip followed the hover, and the drop moved the hovered column onto itself.
  it('moves the column when its menu is open at the start of the drag', async () => {
    mount();
    // A click on the grip opens its menu.
    fireEvent.pointerMove(window, pointer(90, 45));
    await frame();
    const grip = screen.getByRole('button', { name: 'table_column_handle' });
    fireEvent.pointerDown(grip, pointer(90, 45));
    fireEvent.pointerUp(grip, pointer(90, 45));
    await frame();
    expect(grip.getAttribute('aria-expanded')).toBe('true');

    await drag('table_column_handle', { x: 90, y: 45 }, { x: 320, y: 45 });
    expect(rowText(0)).toEqual(['B', 'C', 'A']);
  });

  // Regression: the pointer down on a grip closes the open menu of another control. That close released the
  // lock that the drag had just taken, so the drop moved the hovered column onto itself.
  it('moves the column when the menu of a row is open at the start of the drag', async () => {
    mount();
    fireEvent.pointerMove(window, pointer(45, 115));
    await frame();
    const rowGrip = screen.getByRole('button', { name: 'table_row_handle' });
    fireEvent.pointerDown(rowGrip, pointer(45, 115));
    fireEvent.pointerUp(rowGrip, pointer(45, 115));
    await frame();
    expect(rowGrip.getAttribute('aria-expanded')).toBe('true');

    await drag('table_column_handle', { x: 90, y: 45 }, { x: 320, y: 45 });
    expect(rowText(0)).toEqual(['B', 'C', 'A']);
  });

  it('moves the last row above the second row', async () => {
    mount();
    // Row 2: center y = 115, left border x = 40.
    await drag('table_row_handle', { x: 45, y: 115 }, { x: 45, y: 75 });
    expect(rowText(1)).toEqual(['4', '5', '6']);
    expect(rowText(2)).toEqual(['1', '2', '3']);
  });
});
