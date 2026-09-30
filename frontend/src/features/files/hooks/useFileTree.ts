import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { FileTree, FileTreeFolder, FileTreeNote } from '@/client';
import { sdk } from '@/lib/apiClient';

import { buildChildrenIndex, type ChildrenIndex } from '../lib/fileTree';
import { fileQueryKeys } from '../lib/queryKeys';

export type UseFileTreeResult = {
  tree: FileTree;
  folders: FileTreeFolder[];
  notes: FileTreeNote[];
  /** Memoised parentId → { folders, notes } index used by all rows. */
  childrenIndex: ChildrenIndex;
  isLoading: boolean;
  /** True during any fetch, including a background refetch of stale data. */
  isFetching: boolean;
  isError: boolean;
};

const EMPTY_TREE: FileTree = { folders: [], notes: [] };

/**
 * Fetches the full non-trashed file tree in one request and exposes a
 * memoised children index so rows can look up children without extra fetches.
 *
 * Query key `['folders', 'tree']` sits under `['folders']`, so any existing
 * `invalidateAfterFileChange` call refreshes it too.
 */
export function useFileTree(): UseFileTreeResult {
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: fileQueryKeys.foldersTree(),
    queryFn: () => sdk.foldersTree(),
  });

  const tree = data?.data ?? EMPTY_TREE;

  const childrenIndex = useMemo(() => buildChildrenIndex(tree), [tree]);

  return {
    tree,
    folders: tree.folders,
    notes: tree.notes,
    childrenIndex,
    isLoading,
    isFetching,
    isError,
  };
}
