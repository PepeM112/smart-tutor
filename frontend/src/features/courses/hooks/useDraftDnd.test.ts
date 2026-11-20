// @vitest-environment jsdom

import {
  type DragEndEvent,
  type DragOverEvent,
  type KeyboardCoordinateGetter,
  type KeyboardSensorOptions,
} from '@dnd-kit/core';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type SpaceSectionRead } from '@/client';

import { toOrder } from '../lib/draftOrder';

import { useDraftDnd } from './useDraftDnd';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const section = (id: string, itemIds: string[]) =>
  ({ id, title: id, items: itemIds.map(itemId => ({ id: itemId, title: itemId })) }) as unknown as SpaceSectionRead;

const sections = [section('s1', ['a', 'b']), section('s2', ['c']), section('s3', [])];

// Only the fields the hook reads.
const over = (id: string, top = 0) =>
  ({
    active: { id: '', rect: { current: { translated: { top } } } },
    over: { id, rect: { top: 0, height: 40 } },
  }) as unknown as DragOverEvent;
const overFor = (activeId: string, overId: string, top = 0): DragOverEvent => {
  const event = over(overId, top);
  return { ...event, active: { ...event.active, id: activeId } };
};
const end = (activeId: string, overId: string | null) =>
  ({ active: { id: activeId }, over: overId ? { id: overId } : null }) as unknown as DragEndEvent;

function setup() {
  const onCommit = vi.fn();
  const view = renderHook(() => useDraftDnd({ sections, onCommit }));
  return { onCommit, view, order: () => toOrder(view.result.current.shownSections) };
}

describe('useDraftDnd', () => {
  it('moves a section and saves the full order', () => {
    const { onCommit, view, order } = setup();

    act(() => view.result.current.dndProps.onDragEnd(end('s1', 's2')));

    expect(order().map(s => s.id)).toEqual(['s2', 's1', 's3']);
    expect(onCommit).toHaveBeenCalledWith(order(), expect.any(Function));
  });

  it('reorders an item inside its section', () => {
    const { onCommit, view, order } = setup();

    act(() => view.result.current.dndProps.onDragEnd(end('a', 'b')));

    expect(order()[0]).toEqual({ id: 's1', itemIds: ['b', 'a'] });
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('moves an item into another section while dragging, then keeps it on drop', () => {
    const { onCommit, view, order } = setup();

    act(() => view.result.current.dndProps.onDragOver(overFor('b', 'c')));
    expect(order()).toEqual([
      { id: 's1', itemIds: ['a'] },
      { id: 's2', itemIds: ['b', 'c'] },
      { id: 's3', itemIds: [] },
    ]);

    act(() => view.result.current.dndProps.onDragEnd(end('b', 'c')));
    expect(onCommit).toHaveBeenCalledWith(order(), expect.any(Function));
  });

  it('moves an item into an empty section', () => {
    const { onCommit, view, order } = setup();

    act(() => view.result.current.dndProps.onDragOver(overFor('c', 's3')));
    act(() => view.result.current.dndProps.onDragEnd(end('c', 's3')));

    expect(order()[2]).toEqual({ id: 's3', itemIds: ['c'] });
    expect(order()[1].itemIds).toEqual([]);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('puts the item after the row it is dragged below', () => {
    const { view, order } = setup();

    act(() => view.result.current.dndProps.onDragOver(overFor('a', 'c', 100)));

    expect(order()[1].itemIds).toEqual(['c', 'a']);
  });

  it('saves nothing when the drop changes no place', () => {
    const { onCommit, view } = setup();

    act(() => view.result.current.dndProps.onDragEnd(end('a', 'a')));
    act(() => view.result.current.dndProps.onDragEnd(end('a', null)));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('goes back to the saved order on cancel and when the save ends', () => {
    const { onCommit, view, order } = setup();

    act(() => view.result.current.dndProps.onDragOver(overFor('b', 'c')));
    act(() => view.result.current.dndProps.onDragCancel());
    expect(order()[0].itemIds).toEqual(['a', 'b']);

    act(() => view.result.current.dndProps.onDragEnd(end('s1', 's2')));
    const onSettled = onCommit.mock.calls[0][1] as () => void;
    act(() => onSettled());
    expect(order().map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });

  describe('keyboard coordinates', () => {
    // Layout: s1 holds a, b. s2 holds c. s3 is empty. Each id is a droppable, like in the real editor.
    const rect = (top: number, height: number) => ({
      top,
      height,
      left: 0,
      width: 300,
      bottom: top + height,
      right: 300,
    });
    const rects = new Map([
      ['s1', rect(0, 200)],
      ['a', rect(40, 40)],
      ['b', rect(90, 40)],
      ['s2', rect(220, 100)],
      ['c', rect(260, 40)],
      ['s3', rect(340, 60)],
    ]);

    function moveFrom(activeId: string, code: string) {
      const { view } = setup();
      const options = view.result.current.dndProps.sensors.map(sensor => sensor.options as KeyboardSensorOptions);
      const getter = options.find(option => option?.coordinateGetter)?.coordinateGetter as KeyboardCoordinateGetter;
      const containers = [...rects.keys()].map((id, index) => ({
        id,
        disabled: false,
        node: { current: document.body.appendChild(document.createElement('div')) },
        data: { current: { sortable: { containerId: 'list', index } } },
      }));
      const droppableContainers = {
        get: (id: string) => containers.find(container => container.id === id),
        getEnabled: () => containers,
      };
      const context = {
        active: { id: activeId },
        collisionRect: rects.get(activeId),
        droppableRects: rects,
        droppableContainers,
        over: null,
        scrollableAncestors: [],
      };
      const event = { code, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      return getter(event, { active: activeId, currentCoordinates: { x: 0, y: 0 }, context } as never);
    }

    it('moves a section to the next section, not to an item inside it', () => {
      expect(moveFrom('s1', 'ArrowDown')).toEqual({ x: 0, y: 220 });
    });

    it('moves an item to the next item, not to a section that has items', () => {
      expect(moveFrom('b', 'ArrowDown')).toEqual({ x: 0, y: 260 });
    });

    it('moves an item up to the previous item', () => {
      expect(moveFrom('c', 'ArrowUp')).toEqual({ x: 0, y: 90 });
    });
  });
});
