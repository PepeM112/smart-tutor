import { describe, expect, it } from 'vitest';

import { moveItem, moveSection } from './draftOrder';

const order = [
  { id: 's1', itemIds: ['a', 'b'] },
  { id: 's2', itemIds: ['c'] },
];

describe('moveSection', () => {
  it('swaps with the next section', () => {
    expect(moveSection(order, 0, 1)?.map(s => s.id)).toEqual(['s2', 's1']);
  });

  it('gives null at the ends', () => {
    expect(moveSection(order, 0, -1)).toBeNull();
    expect(moveSection(order, 1, 1)).toBeNull();
  });
});

describe('moveItem', () => {
  it('swaps inside the section', () => {
    expect(moveItem(order, 0, 0, 1)).toEqual([
      { id: 's1', itemIds: ['b', 'a'] },
      { id: 's2', itemIds: ['c'] },
    ]);
  });

  it('goes to the start of the next section at the bottom edge', () => {
    expect(moveItem(order, 0, 1, 1)).toEqual([
      { id: 's1', itemIds: ['a'] },
      { id: 's2', itemIds: ['b', 'c'] },
    ]);
  });

  it('goes to the end of the section above at the top edge', () => {
    expect(moveItem(order, 1, 0, -1)).toEqual([
      { id: 's1', itemIds: ['a', 'b', 'c'] },
      { id: 's2', itemIds: [] },
    ]);
  });

  it('gives null when there is no section to go to', () => {
    expect(moveItem(order, 0, 0, -1)).toBeNull();
    expect(moveItem(order, 1, 0, 1)).toBeNull();
  });

  it('does not change the input', () => {
    moveItem(order, 0, 1, 1);
    expect(order[0].itemIds).toEqual(['a', 'b']);
  });
});
