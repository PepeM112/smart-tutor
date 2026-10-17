import { type SpaceSectionOrder, type SpaceSectionRead } from '@/client';

/** The full draft order that `PUT /spaces/{id}/draft/order` needs: every section and every item, once. */
export function toOrder(sections: SpaceSectionRead[]): SpaceSectionOrder[] {
  return sections.map(section => ({ id: section.id, itemIds: section.items.map(item => item.id) }));
}

/** Move a section one step up (-1) or down (+1). Null when it is already at that end. */
export function moveSection(order: SpaceSectionOrder[], index: number, delta: -1 | 1): SpaceSectionOrder[] | null {
  const target = index + delta;
  if (target < 0 || target >= order.length) return null;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Move an item one step up (-1) or down (+1). At the edge of its section it goes to the end of
 * the section above or the start of the section below, so items can change section without drag and drop.
 * Null when there is no place to go.
 */
export function moveItem(
  order: SpaceSectionOrder[],
  sectionIndex: number,
  itemIndex: number,
  delta: -1 | 1
): SpaceSectionOrder[] | null {
  const section = order[sectionIndex];
  const itemId = section.itemIds[itemIndex];
  const target = itemIndex + delta;
  const next = order.map(s => ({ ...s, itemIds: [...s.itemIds] }));

  if (target >= 0 && target < section.itemIds.length) {
    const ids = next[sectionIndex].itemIds;
    [ids[itemIndex], ids[target]] = [ids[target], ids[itemIndex]];
    return next;
  }

  const otherIndex = sectionIndex + delta;
  if (otherIndex < 0 || otherIndex >= order.length) return null;
  next[sectionIndex].itemIds.splice(itemIndex, 1);
  if (delta === -1) next[otherIndex].itemIds.push(itemId);
  else next[otherIndex].itemIds.unshift(itemId);
  return next;
}
