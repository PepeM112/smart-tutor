import { describe, expect, it } from 'vitest';

import type { FileTree, FileTreeFolder, FileTreeNote } from '@/client';

import {
  buildChildrenIndex,
  canDrop,
  filterTree,
  folderPathNames,
  hasChildItems,
  isDescendantOrSelf,
  isDraggedItem,
  isDropTargetData,
  moveInTree,
} from './fileTree';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2024-01-01T00:00:00Z');

function makeFolder(id: string, parentId: string | null = null): FileTreeFolder {
  return { id, name: id, parentId, updatedAt: NOW };
}

function makeNote(id: string, folderId: string | null = null): FileTreeNote {
  return { id, title: id, folderId, updatedAt: NOW, isFavorite: false, favoritedAt: null };
}

// Tree structure used across tests:
//   root
//   ├── folderA
//   │   ├── folderB
//   │   └── noteB
//   └── noteRoot
const FOLDERS: FileTreeFolder[] = [makeFolder('folderA'), makeFolder('folderB', 'folderA')];
const NOTES: FileTreeNote[] = [makeNote('noteRoot'), makeNote('noteB', 'folderA')];
const TREE: FileTree = { folders: FOLDERS, notes: NOTES };

// ─── buildChildrenIndex ───────────────────────────────────────────────────────

describe('buildChildrenIndex', () => {
  it('places root folders under the null key', () => {
    const index = buildChildrenIndex(TREE);
    expect(index.get(null)?.folders.map(f => f.id)).toEqual(['folderA']);
  });

  it('places root notes under the null key', () => {
    const index = buildChildrenIndex(TREE);
    expect(index.get(null)?.notes.map(n => n.id)).toEqual(['noteRoot']);
  });

  it('places nested items under their parent id', () => {
    const index = buildChildrenIndex(TREE);
    expect(index.get('folderA')?.folders.map(f => f.id)).toEqual(['folderB']);
    expect(index.get('folderA')?.notes.map(n => n.id)).toEqual(['noteB']);
  });

  it('returns empty buckets for folders with no children', () => {
    const index = buildChildrenIndex(TREE);
    const bucket = index.get('folderB');
    // folderB has no children — bucket may be absent or empty.
    expect(bucket?.folders ?? []).toHaveLength(0);
    expect(bucket?.notes ?? []).toHaveLength(0);
  });

  it('handles an empty tree without throwing', () => {
    const index = buildChildrenIndex({ folders: [], notes: [] });
    expect(index.size).toBe(0);
  });
});

// ─── isDescendantOrSelf ───────────────────────────────────────────────────────

describe('isDescendantOrSelf', () => {
  it('returns true for self', () => {
    expect(isDescendantOrSelf('folderA', 'folderA', FOLDERS)).toBe(true);
  });

  it('returns true for a direct child', () => {
    expect(isDescendantOrSelf('folderB', 'folderA', FOLDERS)).toBe(true);
  });

  it('returns false for an ancestor', () => {
    expect(isDescendantOrSelf('folderA', 'folderB', FOLDERS)).toBe(false);
  });

  it('returns false for an unrelated folder', () => {
    const folders = [...FOLDERS, makeFolder('folderC')];
    expect(isDescendantOrSelf('folderC', 'folderA', folders)).toBe(false);
  });

  it('guards against cycles in corrupted data', () => {
    // folderX → folderY → folderX (cycle)
    const cyclic: FileTreeFolder[] = [
      { id: 'folderX', name: 'X', parentId: 'folderY', updatedAt: NOW },
      { id: 'folderY', name: 'Y', parentId: 'folderX', updatedAt: NOW },
    ];
    expect(isDescendantOrSelf('folderX', 'folderZ', cyclic)).toBe(false);
  });
});

// ─── canDrop ─────────────────────────────────────────────────────────────────

describe('canDrop', () => {
  it('disallows dropping into the current parent (no-op)', () => {
    expect(canDrop({ kind: 'folder', id: 'folderA', parentId: null, name: 'A' }, null, FOLDERS)).toBe(false);
  });

  it('disallows dropping a folder onto itself', () => {
    expect(canDrop({ kind: 'folder', id: 'folderA', parentId: null, name: 'A' }, 'folderA', FOLDERS)).toBe(false);
  });

  it('disallows dropping a folder onto a descendant', () => {
    expect(canDrop({ kind: 'folder', id: 'folderA', parentId: null, name: 'A' }, 'folderB', FOLDERS)).toBe(false);
  });

  it('allows dropping a folder into a valid unrelated folder', () => {
    const folders = [...FOLDERS, makeFolder('folderC')];
    expect(canDrop({ kind: 'folder', id: 'folderC', parentId: null, name: 'C' }, 'folderA', folders)).toBe(true);
  });

  it('allows dropping a note into any folder (notes cannot be ancestors)', () => {
    expect(canDrop({ kind: 'note', id: 'noteRoot', parentId: null, name: 'note' }, 'folderA', FOLDERS)).toBe(true);
  });

  it('disallows dropping a note into its current folder', () => {
    expect(canDrop({ kind: 'note', id: 'noteB', parentId: 'folderA', name: 'noteB' }, 'folderA', FOLDERS)).toBe(false);
  });
});

// ─── moveInTree ───────────────────────────────────────────────────────────────

describe('moveInTree', () => {
  it('moves a folder to a new parent without mutating the original', () => {
    const result = moveInTree(TREE, { kind: 'folder', id: 'folderA' }, 'folderB');
    const moved = result.folders.find(f => f.id === 'folderA');
    expect(moved?.parentId).toBe('folderB');
    // Original untouched.
    expect(TREE.folders.find(f => f.id === 'folderA')?.parentId).toBeNull();
  });

  it('moves a note to a new folder', () => {
    const result = moveInTree(TREE, { kind: 'note', id: 'noteRoot' }, 'folderA');
    const moved = result.notes.find(n => n.id === 'noteRoot');
    expect(moved?.folderId).toBe('folderA');
  });

  it('moves a note to the root (null)', () => {
    const result = moveInTree(TREE, { kind: 'note', id: 'noteB' }, null);
    expect(result.notes.find(n => n.id === 'noteB')?.folderId).toBeNull();
  });

  it('leaves other items unchanged', () => {
    const result = moveInTree(TREE, { kind: 'folder', id: 'folderA' }, 'folderB');
    expect(result.folders.find(f => f.id === 'folderB')?.parentId).toBe('folderA');
    expect(result.notes).toEqual(TREE.notes);
  });
});

// ─── type guards ──────────────────────────────────────────────────────────────

describe('isDraggedItem', () => {
  it('accepts a valid dragged item', () => {
    expect(isDraggedItem({ kind: 'note', id: 'n1', parentId: null, name: 'Note' })).toBe(true);
  });

  it('rejects missing, wrong or non-object values', () => {
    expect(isDraggedItem(undefined)).toBe(false);
    expect(isDraggedItem(null)).toBe(false);
    expect(isDraggedItem({ kind: 'file', id: 'x', parentId: null, name: 'x' })).toBe(false);
    expect(isDraggedItem({ kind: 'folder', id: 'x', name: 'x' })).toBe(false);
  });
});

describe('isDropTargetData', () => {
  it('accepts a folder id or null', () => {
    expect(isDropTargetData({ folderId: 'a' })).toBe(true);
    expect(isDropTargetData({ folderId: null })).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isDropTargetData(undefined)).toBe(false);
    expect(isDropTargetData({})).toBe(false);
    expect(isDropTargetData({ folderId: 5 })).toBe(false);
  });
});

// ─── hasChildItems ────────────────────────────────────────────────────────────

describe('hasChildItems', () => {
  const index = buildChildrenIndex(TREE);

  it('is true for a folder with a sub-folder or a note', () => {
    expect(hasChildItems(index, 'folderA')).toBe(true);
  });

  it('is false for a folder with nothing inside', () => {
    expect(hasChildItems(index, 'folderB')).toBe(false);
  });
});

// ─── filterTree ───────────────────────────────────────────────────────────────

describe('filterTree', () => {
  // root
  // ├── Spanish            (folder)
  // │   ├── Verbs          (folder)
  // │   │   └── Irregular  (note)
  // │   └── Greetings      (note)
  // ├── Maths              (folder)
  // │   └── Algebra        (note)
  // └── Todo               (note)
  const folder = (id: string, name: string, parentId: string | null = null): FileTreeFolder => ({
    ...makeFolder(id, parentId),
    name,
  });
  const note = (id: string, title: string, folderId: string | null = null): FileTreeNote => ({
    ...makeNote(id, folderId),
    title,
  });
  const index = buildChildrenIndex({
    folders: [folder('spanish', 'Spanish'), folder('verbs', 'Verbs', 'spanish'), folder('maths', 'Maths')],
    notes: [
      note('irregular', 'Irregular', 'verbs'),
      note('greetings', 'Greetings', 'spanish'),
      note('algebra', 'Algebra', 'maths'),
      note('todo', 'Todo'),
    ],
  });

  it('returns null for an empty or blank query', () => {
    expect(filterTree(index, null, '')).toBeNull();
    expect(filterTree(index, null, '   ')).toBeNull();
  });

  it('shows a deep match with its ancestors, and forces only the ancestors open', () => {
    const result = filterTree(index, null, 'irreg');
    expect([...(result?.visibleIds ?? [])].sort()).toEqual(['irregular', 'spanish', 'verbs']);
    expect([...(result?.forcedExpanded ?? [])].sort()).toEqual(['spanish', 'verbs']);
  });

  it('shows the whole subtree of a folder that matches by name, without forcing it open', () => {
    const result = filterTree(index, null, 'spanish');
    expect([...(result?.visibleIds ?? [])].sort()).toEqual(['greetings', 'irregular', 'spanish', 'verbs']);
    expect(result?.forcedExpanded.size).toBe(0);
  });

  it('forces a matching folder open when something deeper matches too', () => {
    const planIndex = buildChildrenIndex({
      folders: [folder('plan', 'Plan')],
      notes: [note('planB', 'Plan B', 'plan'), note('other', 'Other', 'plan')],
    });
    const result = filterTree(planIndex, null, 'plan');
    expect([...(result?.visibleIds ?? [])].sort()).toEqual(['other', 'plan', 'planB']);
    expect([...(result?.forcedExpanded ?? [])]).toEqual(['plan']);
  });

  it('matches case-insensitive and trimmed', () => {
    const result = filterTree(index, null, '  ALGEBRA ');
    expect([...(result?.visibleIds ?? [])].sort()).toEqual(['algebra', 'maths']);
  });

  it('only looks in the subtree of the root id', () => {
    const result = filterTree(index, 'spanish', 'a');
    // "Greetings" has no "a"; "Irregular" has. "Algebra" and "Maths" are outside the scope.
    expect(result?.visibleIds.has('algebra')).toBe(false);
    expect(result?.visibleIds.has('irregular')).toBe(true);
    expect(result?.visibleIds.has('spanish')).toBe(false);
  });

  it('returns empty sets when nothing matches', () => {
    const result = filterTree(index, null, 'zzz');
    expect(result?.visibleIds.size).toBe(0);
    expect(result?.forcedExpanded.size).toBe(0);
  });
});

// ─── folderPathNames ──────────────────────────────────────────────────────────

describe('folderPathNames', () => {
  it('returns the names from the root down to the folder', () => {
    expect(folderPathNames(FOLDERS, 'folderB')).toEqual(['folderA', 'folderB']);
  });

  it('returns an empty list for the root', () => {
    expect(folderPathNames(FOLDERS, null)).toEqual([]);
  });
});
