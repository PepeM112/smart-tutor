import { type SpaceSectionOrder, type SpaceSectionRead } from '@/client';

/** The full draft order that `PUT /spaces/{id}/draft/order` needs: every section and every item, once. */
export function toOrder(sections: SpaceSectionRead[]): SpaceSectionOrder[] {
  return sections.map(section => ({ id: section.id, itemIds: section.items.map(item => item.id) }));
}

/** The index of the section that holds the item, or -1. */
export function sectionIndexOfItem(order: SpaceSectionOrder[], itemId: string): number {
  return order.findIndex(section => section.itemIds.includes(itemId));
}

/** Move a section from one index to another (the result has it at `toIndex`). */
export function moveSectionTo(order: SpaceSectionOrder[], fromIndex: number, toIndex: number): SpaceSectionOrder[] {
  const next = [...order];
  const [section] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, section);
  return next;
}

/**
 * Move an item to `index` of a section (the result has it there), also from another section.
 * An index past the end puts it last. The order is unchanged when the item or the section is not in it.
 */
export function moveItemTo(
  order: SpaceSectionOrder[],
  itemId: string,
  targetSectionId: string,
  index: number
): SpaceSectionOrder[] {
  if (sectionIndexOfItem(order, itemId) === -1 || !order.some(section => section.id === targetSectionId)) return order;
  return order.map(section => {
    const itemIds = section.itemIds.filter(id => id !== itemId);
    if (section.id === targetSectionId) itemIds.splice(Math.max(0, index), 0, itemId);
    return { ...section, itemIds };
  });
}

/** True when both orders have the same sections and items in the same places. */
export function isSameOrder(a: SpaceSectionOrder[], b: SpaceSectionOrder[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (section, i) =>
        section.id === b[i].id &&
        section.itemIds.length === b[i].itemIds.length &&
        section.itemIds.every((id, j) => id === b[i].itemIds[j])
    )
  );
}

/** The sections with their items arranged as `order` says. Ids that `sections` does not hold are dropped. */
export function applyOrder(sections: SpaceSectionRead[], order: SpaceSectionOrder[]): SpaceSectionRead[] {
  const sectionsById = new Map(sections.map(section => [section.id, section]));
  const itemsById = new Map(sections.flatMap(section => section.items).map(item => [item.id, item]));
  return order.flatMap(({ id, itemIds }) => {
    const section = sectionsById.get(id);
    return section ? [{ ...section, items: itemIds.flatMap(itemId => itemsById.get(itemId) ?? []) }] : [];
  });
}
