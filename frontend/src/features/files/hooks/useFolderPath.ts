import { useMemo } from 'react';

import type { FileTreeFolder } from '@/client';

import { useFolders } from './useFolders';

/**
 * Build the ancestor chain from root to (and including) `folderId`.
 *
 * Returns an empty array for null (root). Stops at the first cycle or
 * missing folder to prevent an infinite loop with corrupt data.
 */
export function buildFolderPath(folderId: string | null, folders: FileTreeFolder[]): FileTreeFolder[] {
  if (!folderId) return [];

  const path: FileTreeFolder[] = [];
  const visited = new Set<string>();
  let current: FileTreeFolder | undefined = folders.find(f => f.id === folderId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    // Prepend so the result is ordered root → leaf.
    path.unshift(current);
    const parentId = current.parentId;
    current = parentId ? folders.find(f => f.id === parentId) : undefined;
  }

  return path;
}

/**
 * Returns the ancestor chain for `folderId` (root → leaf, inclusive).
 * Reads from the cached file tree — no extra fetch.
 */
export function useFolderPath(folderId: string | null): FileTreeFolder[] {
  const { folders } = useFolders();
  return useMemo(() => buildFolderPath(folderId, folders), [folderId, folders]);
}
