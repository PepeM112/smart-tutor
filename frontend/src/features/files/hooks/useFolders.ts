import { useMemo } from 'react';

import type { FileTreeFolder } from '@/client';

import { useFileTree } from './useFileTree';

export type UseFoldersResult = {
  folders: FileTreeFolder[];
  foldersById: Map<string, FileTreeFolder>;
  isLoading: boolean;
  isError: boolean;
};

/**
 * All non-trashed folders, read from the file tree. The tree is the only folder
 * source, so lists, pickers and breadcrumbs never drift apart.
 */
export function useFolders(): UseFoldersResult {
  const { folders, isLoading, isError } = useFileTree();
  const foldersById = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);
  return { folders, foldersById, isLoading, isError };
}
