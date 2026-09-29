import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { type FolderRead } from '@/client';
import { sdk } from '@/lib/apiClient';

/**
 * Build the ancestor chain from root to (and including) `folderId`.
 *
 * Returns an empty array for null (root). Stops at the first cycle or
 * missing folder to prevent an infinite loop with corrupt data.
 */
export function buildFolderPath(folderId: string | null, folders: FolderRead[]): FolderRead[] {
  if (!folderId) return [];

  const path: FolderRead[] = [];
  const visited = new Set<string>();
  let current: FolderRead | undefined = folders.find(f => f.id === folderId);

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
 * Reads from the cached `['folders']` list — no extra fetch.
 */
export function useFolderPath(folderId: string | null): FolderRead[] {
  const { data: foldersRes } = useQuery({
    queryKey: ['folders'],
    queryFn: () => sdk.foldersList(),
  });

  // Keep the folders reference stable for useMemo by deriving inside the callback.
  return useMemo(() => buildFolderPath(folderId, foldersRes?.data ?? []), [folderId, foldersRes?.data]);
}
