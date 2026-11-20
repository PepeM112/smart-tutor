import {
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DroppableContainer,
  type DroppableContainers,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { type SpaceSectionOrder, type SpaceSectionRead } from '@/client';

import { applyOrder, isSameOrder, moveItemTo, moveSectionTo, sectionIndexOfItem, toOrder } from '../lib/draftOrder';

type Options = {
  sections: SpaceSectionRead[];
  /** Saves the new order. `onSettled` runs when the save ends (done or failed). */
  onCommit: (order: SpaceSectionOrder[], onSettled: () => void) => void;
};

/**
 * Drag and drop for the draft editor: sections reorder, items reorder and move to any section (also an empty one).
 * `sections` is what to render: the live order while a drag runs, and the new order until the save ends.
 * The pure order logic is in `draftOrder.ts`.
 */
export function useDraftDnd({ sections, onCommit }: Options) {
  const t = useTranslations();
  const baseOrder = useMemo(() => toOrder(sections), [sections]);
  const [draftOrder, setDraftOrder] = useState<SpaceSectionOrder[] | null>(null);
  const order = draftOrder ?? baseOrder;

  const isSection = useCallback((id: string | number) => order.some(section => section.id === id), [order]);

  // A section only meets sections. An item meets items, and sections with no items (nothing else to drop on).
  const targetsFor = useCallback(
    (activeId: string | number, containers: DroppableContainer[]): DroppableContainer[] => {
      if (isSection(activeId)) return containers.filter(c => isSection(c.id));
      const emptySectionIds = new Set(order.filter(section => section.itemIds.length === 0).map(section => section.id));
      return containers.filter(c => !isSection(c.id) || emptySectionIds.has(String(c.id)));
    },
    [isSection, order]
  );

  // The stock getter looks at every droppable below the dragged one: a section would jump into its own first item
  // and never reach the next section. It only gets the targets the drag can meet.
  const keyboardCoordinates: KeyboardCoordinateGetter = useCallback(
    (event, args) => {
      const { active, droppableContainers } = args.context;
      if (!active) return undefined;
      const targets = {
        get: (id: string | number) => droppableContainers.get(id),
        getEnabled: () => targetsFor(active.id, droppableContainers.getEnabled()),
      } as unknown as DroppableContainers;
      return sortableKeyboardCoordinates(event, {
        ...args,
        context: { ...args.context, droppableContainers: targets },
      });
    },
    [targetsFor]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates })
  );

  const collisionDetection: CollisionDetection = useCallback(
    args => {
      const candidates = targetsFor(args.active.id, [...args.droppableContainers]);
      if (isSection(args.active.id)) return closestCenter({ ...args, droppableContainers: candidates });
      const hits = pointerWithin({ ...args, droppableContainers: candidates });
      // The keyboard has no pointer: it falls back to the nearest target.
      return hits.length > 0 ? hits : closestCorners({ ...args, droppableContainers: candidates });
    },
    [isSection, targetsFor]
  );

  // An item that crosses into another section moves there at once, so the rows make room while it is dragged.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || isSection(active.id)) return;
    const itemId = String(active.id);
    const overId = String(over.id);
    const fromIndex = sectionIndexOfItem(order, itemId);
    const targetIndex = isSection(overId) ? order.findIndex(s => s.id === overId) : sectionIndexOfItem(order, overId);
    if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return;

    const target = order[targetIndex];
    const overItemIndex = target.itemIds.indexOf(overId);
    const translated = active.rect.current.translated;
    const isBelowOver = translated !== null && translated.top > over.rect.top + over.rect.height;
    const index = overItemIndex === -1 ? target.itemIds.length : overItemIndex + (isBelowOver ? 1 : 0);
    setDraftOrder(moveItemTo(order, itemId, target.id, index));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const next = over ? orderAfterDrop(String(active.id), String(over.id)) : baseOrder;
    if (isSameOrder(next, baseOrder)) {
      setDraftOrder(null);
      return;
    }
    // Keep the new order on screen until the save ends: then the server data replaces it (or it falls back on error).
    setDraftOrder(next);
    onCommit(next, () => setDraftOrder(null));
  }

  function orderAfterDrop(activeId: string, overId: string): SpaceSectionOrder[] {
    if (isSection(activeId)) {
      const from = order.findIndex(s => s.id === activeId);
      const to = order.findIndex(s => s.id === overId);
      return from === -1 || to === -1 ? order : moveSectionTo(order, from, to);
    }
    // After the drag over, the item is already in its section: here it only finds its place among the rows.
    const sectionIndex = sectionIndexOfItem(order, activeId);
    const overIndex = sectionIndex === -1 ? -1 : order[sectionIndex].itemIds.indexOf(overId);
    return overIndex === -1 ? order : moveItemTo(order, activeId, order[sectionIndex].id, overIndex);
  }

  const titles = new Map<string, string>(
    sections.flatMap(
      section =>
        [[section.id, section.title], ...section.items.map(item => [item.id, item.title])] as [string, string][]
    )
  );
  const titleOf = (id: string | number): string => titles.get(String(id)) ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }: DragStartEvent) => t('courses.dnd_picked_up', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t('courses.dnd_over', { title: titleOf(active.id), target: titleOf(over.id) }) : undefined,
    onDragEnd: ({ active }) => t('courses.dnd_dropped', { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => t('courses.dnd_cancelled', { title: titleOf(active.id) }),
  };

  return {
    shownSections: useMemo(() => applyOrder(sections, order), [sections, order]),
    sectionIds: order.map(section => section.id),
    dndProps: {
      sensors,
      collisionDetection,
      onDragOver: handleDragOver,
      onDragEnd: handleDragEnd,
      onDragCancel: () => setDraftOrder(null),
      accessibility: { announcements, screenReaderInstructions: { draggable: t('courses.dnd_instructions') } },
    },
  };
}
