import { describe, expect, it } from 'vitest';

import type { FileTree, FileTreeFolder, FileTreeNote } from '@/client';

import { buildChildrenIndex, canDrop, isDescendantOrSelf, moveInTree } from './fileTree';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2024-01-01T00:00:00Z');

function makeFolder(id: string, parentId: string | null = null): FileTreeFolder {
  return { id, name: id, parentId, updatedAt: NOW };
}

function makeNote(id: string, folderId: string | null = null): FileTreeNote {
  return { id, title: id, folderId, updatedAt: NOW };
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
