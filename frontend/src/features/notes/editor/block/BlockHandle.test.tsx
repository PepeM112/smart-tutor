// @vitest-environment jsdom

// Integration test of the block handle: a real Tiptap editor, the real overlay, the grip menu and a pointer drag.
// jsdom has no layout, so `getBoundingClientRect` gives a fixed column of blocks (a block every 40px, 30px high,
// 100px from the left edge), and jsdom has no pointer capture (see `table/TableControls.test.tsx`).

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BlockHandle } from './BlockHandle';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const BLOCK = { left: 100, pitch: 40, height: 30 };

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
  const parent = this.parentElement;
  if (parent?.classList.contains('ProseMirror')) {
    const index = Array.from(parent.children).indexOf(this);
    return rect(BLOCK.left, index * BLOCK.pitch, 600, BLOCK.height);
  }
  return rect(0, 0, 800, 600);
}

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
  Object.assign(HTMLElement.prototype, { setPointerCapture: () => undefined });
  // jsdom has no layout, and `scrollIntoView` is used by the menu.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  cleanup();
  // Radix runs `onCloseAutoFocus` after the unmount. The editor must still exist then.
  await new Promise(resolve => setTimeout(resolve, 5));
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

  editor = new Editor({ element: editorHost, extensions: [StarterKit], content: '<p>One</p><p>Two</p><p>Three</p>' });
  render(
    <Tooltip.Provider>
      <BlockHandle editor={editor} containerRef={{ current: container }} />
    </Tooltip.Provider>,
    { container: overlayHost }
  );
}

/** Let the overlay measure (it measures in `requestAnimationFrame`) and React render. */
const frame = () => act(() => new Promise(resolve => setTimeout(resolve, 5)));

const pointer = (x: number, y: number) => ({ button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });

const texts = (): string[] => Array.from(editor.view.dom.children).map(block => block.textContent ?? '');

/** Hover the first line of block `index`. The handle shows next to it. */
async function hoverBlock(index: number) {
  fireEvent.pointerMove(window, pointer(BLOCK.left + 20, index * BLOCK.pitch + 10));
  await frame();
  return screen.getByRole('button', { name: 'block_handle' });
}

describe('BlockHandle: hover', () => {
  it('shows the handle for the block under the pointer, and follows the pointer to another block', async () => {
    mount();
    expect(screen.queryByRole('button', { name: 'block_handle' })).toBeNull();

    const grip = await hoverBlock(0);
    // jsdom has no text layout, so the handle sits 14px under the block top, minus half of the 24px button.
    expect(grip.parentElement?.style.top).toBe('2px');

    await hoverBlock(2);
    expect(screen.getByRole('button', { name: 'block_handle' }).parentElement?.style.top).toBe('82px');
  });

  it('follows the block when the note scrolls under a pointer that does not move', async () => {
    mount();
    const grip = await hoverBlock(0);
    expect(grip.parentElement?.style.top).toBe('2px');

    // The note scrolls by 10px: the pointer is still over the first block, but the block is lower.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const box = geometry.call(this);
      return this.parentElement?.classList.contains('ProseMirror') ? rect(box.left, box.top + 10, 600, 30) : box;
    });
    await act(async () => {
      fireEvent.scroll(document.body);
      await new Promise(resolve => setTimeout(resolve, 5));
    });

    expect(screen.getByRole('button', { name: 'block_handle' }).parentElement?.style.top).toBe('12px');
  });
});

describe('BlockHandle: menu', () => {
  it('opens on a click of the grip, selects the block, and deletes it from the menu', async () => {
    mount();
    const grip = await hoverBlock(1);

    fireEvent.pointerDown(grip, pointer(BLOCK.left - 20, 50));
    fireEvent.pointerUp(grip, pointer(BLOCK.left - 20, 50));
    await frame();
    expect(grip.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(await screen.findByRole('menuitem', { name: 'block_delete' }));
    await frame();

    expect(texts()).toEqual(['One', 'Three']);
  });

  it('duplicates the block from the menu', async () => {
    mount();
    const grip = await hoverBlock(0);

    fireEvent.pointerDown(grip, pointer(BLOCK.left - 20, 10));
    fireEvent.pointerUp(grip, pointer(BLOCK.left - 20, 10));
    await frame();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'block_duplicate' }));
    await frame();

    expect(texts()).toEqual(['One', 'One', 'Two', 'Three']);
  });
});

describe('BlockHandle: drag', () => {
  it('moves the block to the gap under the pointer', async () => {
    mount();
    const grip = await hoverBlock(0);
    const start = { x: BLOCK.left - 20, y: 10 };

    fireEvent.pointerDown(grip, pointer(start.x, start.y));
    await frame();
    // Down to y = 75: the gap between "Two" (70) and "Three" (80).
    const steps = 6;
    await Array.from({ length: steps }, (_, i) => i + 1).reduce(async (previous, step) => {
      await previous;
      fireEvent.pointerMove(grip, { ...pointer(start.x, start.y + ((75 - start.y) * step) / steps), buttons: 1 });
      await frame();
    }, Promise.resolve());
    fireEvent.pointerUp(grip, pointer(start.x, 75));
    await frame();

    expect(texts()).toEqual(['Two', 'One', 'Three']);
  });

  it('does not move the block when the drag is a click (no distance)', async () => {
    mount();
    const grip = await hoverBlock(0);

    fireEvent.pointerDown(grip, pointer(BLOCK.left - 20, 10));
    fireEvent.pointerMove(grip, { ...pointer(BLOCK.left - 20, 11), buttons: 1 });
    fireEvent.pointerUp(grip, pointer(BLOCK.left - 20, 11));
    await frame();

    expect(texts()).toEqual(['One', 'Two', 'Three']);
  });
});
