import { describe, expect, it } from 'vitest';

import type { FileTreeFolder, FileTreeNote } from '@/client';

import { folderSiblings, noteSiblings } from './siblings';

import type { ChildrenIndex } from './fileTree';

// The builders read only id, name/title and the key in the index, so a partial object is sufficient.
const folder = (id: string, name: string) => ({ id, name }) as FileTreeFolder;
const note = (id: string, title: string) => ({ id, title }) as FileTreeNote;

const index: ChildrenIndex = new Map([
  [null, { folders: [folder('a', 'Alpha'), folder('b', 'Beta')], notes: [note('n1', 'One'), note('n2', 'Two')] }],
]);

describe('sibling builders', () => {
  it('leaves out the current folder', () => {
    expect(folderSiblings(index, null, 'a').map(s => s.id)).toEqual(['b']);
  });

  it('leaves out the current note', () => {
    expect(noteSiblings(index, null, 'n2').map(s => s.id)).toEqual(['n1']);
  });

  it('gives an empty list when the current item is the only child', () => {
    const single: ChildrenIndex = new Map([[null, { folders: [folder('a', 'Alpha')], notes: [] }]]);
    expect(folderSiblings(single, null, 'a')).toEqual([]);
  });
});
