import { describe, expect, it } from 'vitest';

import { type SpaceSectionRead } from '@/client';

import { applyOrder, isSameOrder, moveItemTo, moveSectionTo, sectionIndexOfItem, toOrder } from './draftOrder';

const order = [
  { id: 's1', itemIds: ['a', 'b'] },
  { id: 's2', itemIds: ['c'] },
  { id: 's3', itemIds: [] as string[] },
];

describe('sectionIndexOfItem', () => {
  it('finds the section of an item', () => {
    expect(sectionIndexOfItem(order, 'c')).toBe(1);
  });

  it('gives -1 for an unknown item', () => {
    expect(sectionIndexOfItem(order, 'zzz')).toBe(-1);
  });
});

describe('moveSectionTo', () => {
  it('moves a section down', () => {
    expect(moveSectionTo(order, 0, 2).map(s => s.id)).toEqual(['s2', 's3', 's1']);
  });

  it('moves a section up', () => {
    expect(moveSectionTo(order, 2, 0).map(s => s.id)).toEqual(['s3', 's1', 's2']);
  });

  it('does not change the input', () => {
    moveSectionTo(order, 0, 2);
    expect(order.map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('moveItemTo', () => {
  it('reorders inside the section', () => {
    expect(moveItemTo(order, 'a', 's1', 1)).toEqual([
      { id: 's1', itemIds: ['b', 'a'] },
      { id: 's2', itemIds: ['c'] },
      { id: 's3', itemIds: [] },
    ]);
  });

  it('moves to another section at an index', () => {
    expect(moveItemTo(order, 'b', 's2', 0)).toEqual([
      { id: 's1', itemIds: ['a'] },
      { id: 's2', itemIds: ['b', 'c'] },
      { id: 's3', itemIds: [] },
    ]);
  });

  it('moves into an empty section', () => {
    expect(moveItemTo(order, 'c', 's3', 0)).toEqual([
      { id: 's1', itemIds: ['a', 'b'] },
      { id: 's2', itemIds: [] },
      { id: 's3', itemIds: ['c'] },
    ]);
  });

  it('puts an item last when the index is past the end', () => {
    expect(moveItemTo(order, 'a', 's2', 99)[1].itemIds).toEqual(['c', 'a']);
  });

  it('keeps the order when the item or the section is unknown', () => {
    expect(moveItemTo(order, 'zzz', 's1', 0)).toBe(order);
    expect(moveItemTo(order, 'a', 'zzz', 0)).toBe(order);
  });

  it('does not change the input', () => {
    moveItemTo(order, 'b', 's2', 0);
    expect(order[0].itemIds).toEqual(['a', 'b']);
  });
});

describe('isSameOrder', () => {
  it('is true for equal orders and false after a move', () => {
    expect(isSameOrder(order, moveItemTo(order, 'a', 's1', 0))).toBe(true);
    expect(isSameOrder(order, moveItemTo(order, 'a', 's2', 0))).toBe(false);
    expect(isSameOrder(order, moveSectionTo(order, 0, 1))).toBe(false);
  });
});

describe('applyOrder', () => {
  const section = (id: string, itemIds: string[]) =>
    ({ id, title: id, items: itemIds.map(itemId => ({ id: itemId })) }) as unknown as SpaceSectionRead;
  const sections = [section('s1', ['a', 'b']), section('s2', ['c'])];

  it('arranges sections and items as the order says', () => {
    const next = applyOrder(sections, moveItemTo(toOrder(sections), 'a', 's2', 1));
    expect(toOrder(next)).toEqual([
      { id: 's1', itemIds: ['b'] },
      { id: 's2', itemIds: ['c', 'a'] },
    ]);
  });

  it('drops ids that no section holds', () => {
    const next = applyOrder(sections, [
      { id: 's1', itemIds: ['a', 'gone'] },
      { id: 'gone', itemIds: [] },
    ]);
    expect(toOrder(next)).toEqual([{ id: 's1', itemIds: ['a'] }]);
  });
});
