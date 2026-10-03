import type { FileTree, FileTreeFolder, FileTreeNote } from '@/client';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Map from parentId (or null = root) to the direct children of that folder.
 * Backend sends folders sorted by lower(name) and notes by lower(title),
 * so insertion order preserves the backend sort.
 */
export type ChildrenIndex = Map<string | null, { folders: FileTreeFolder[]; notes: FileTreeNote[] }>;

export type DraggedItem = {
  kind: 'folder' | 'note';
  id: string;
  /**
   * For a folder this is `folder.parentId`; for a note this is `note.folderId`.
   * Both represent "current parent" in the tree.
   */
  parentId: string | null;
  name: string;
};

/** Data that a folder drop zone (folder row or view zone) puts on its droppable. */
export type DropTargetData = {
  /** null = the view level (root). */
  folderId: string | null;
};

// ─── Type guards ──────────────────────────────────────────────────────────────
// dnd-kit types `data.current` as `any`. These guards check the shape at runtime,
// so a wrong payload is ignored instead of crashing a drop handler.

export function isDraggedItem(value: unknown): value is DraggedItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kind === 'folder' || v.kind === 'note') &&
    typeof v.id === 'string' &&
    (v.parentId === null || typeof v.parentId === 'string') &&
    typeof v.name === 'string'
  );
}

export function isDropTargetData(value: unknown): value is DropTargetData {
  if (typeof value !== 'object' || value === null) return false;
  const folderId = (value as Record<string, unknown>).folderId;
  return folderId === null || typeof folderId === 'string';
}

// ─── buildChildrenIndex ───────────────────────────────────────────────────────

/**
 * Build a parentId → { folders, notes } index from the flat tree lists.
 * Each entry is appended in the order it arrives from the server (already sorted).
 */
export function buildChildrenIndex(tree: FileTree): ChildrenIndex {
  const index = new Map<string | null, { folders: FileTreeFolder[]; notes: FileTreeNote[] }>();

  // Shared helper: fetch or create an empty bucket for a key.
  const bucket = (key: string | null) => {
    const existing = index.get(key);
    if (existing) return existing;
    const entry = { folders: [] as FileTreeFolder[], notes: [] as FileTreeNote[] };
    index.set(key, entry);
    return entry;
  };

  tree.folders.forEach(f => bucket(f.parentId).folders.push(f));
  tree.notes.forEach(n => bucket(n.folderId).notes.push(n));

  return index;
}

/**
 * True when the folder has at least one live child (folder or note).
 * One place for "can this folder open?" and "is this folder empty?".
 */
export function hasChildItems(index: ChildrenIndex, folderId: string): boolean {
  const children = index.get(folderId);
  return (children?.folders.length ?? 0) + (children?.notes.length ?? 0) > 0;
}

// ─── isDescendantOrSelf ───────────────────────────────────────────────────────

/**
 * Returns true when `folderId` equals `candidateAncestorId` or is anywhere
 * below it in the folder tree.
 * A visited-set guards against cycles in corrupted data.
 */
export function isDescendantOrSelf(folderId: string, candidateAncestorId: string, folders: FileTreeFolder[]): boolean {
  // Build a quick id → parentId lookup to avoid repeated Array.find calls.
  const parentOf = new Map(folders.map(f => [f.id, f.parentId]));

  const visited = new Set<string>();
  let current: string | null = folderId;

  while (current !== null) {
    if (visited.has(current)) return false; // cycle guard
    visited.add(current);
    if (current === candidateAncestorId) return true;
    current = parentOf.get(current) ?? null;
  }

  return false;
}

// ─── canDrop ─────────────────────────────────────────────────────────────────

/**
 * Returns true when dropping `dragged` onto `targetFolderId` is a valid move.
 *
 * Invalid cases:
 *  - Dropping into the current parent (no-op).
 *  - Dropping a folder onto itself or one of its descendants (cycle).
 */
export function canDrop(dragged: DraggedItem, targetFolderId: string | null, folders: FileTreeFolder[]): boolean {
  // Dropping into the current parent is a no-op, so we disallow it.
  if (dragged.parentId === targetFolderId) return false;

  if (dragged.kind === 'folder' && targetFolderId !== null) {
    // Prevent a folder from being dropped into itself or any descendant.
    if (isDescendantOrSelf(targetFolderId, dragged.id, folders)) return false;
  }

  return true;
}

// ─── moveInTree ───────────────────────────────────────────────────────────────

/**
 * Returns a new `FileTree` with `dragged` reparented to `targetFolderId`.
 * Used for optimistic UI updates; never mutates the original tree.
 */
export function moveInTree(
  tree: FileTree,
  dragged: Pick<DraggedItem, 'kind' | 'id'>,
  targetFolderId: string | null
): FileTree {
  if (dragged.kind === 'folder') {
    return {
      ...tree,
      folders: tree.folders.map(f => (f.id === dragged.id ? { ...f, parentId: targetFolderId } : f)),
    };
  }

  return {
    ...tree,
    notes: tree.notes.map(n => (n.id === dragged.id ? { ...n, folderId: targetFolderId } : n)),
  };
}
