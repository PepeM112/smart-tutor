'use client';

import { createContext, useContext } from 'react';

import { type FileTreeFolder } from '@/client';

import { type useFileMutations } from '../hooks/useFileMutations';
import { type ChildrenIndex } from '../lib/fileTree';

export type FilesTreeContextValue = {
  /**
   * True when the folder shows open: the user opened it, or a search match is below it.
   * The search part is derived here and is never written to the saved expand state.
   */
  isExpanded: (folderId: string) => boolean;
  /** False for a row that the search hides. Always true when no search is active. */
  isVisible: (id: string) => boolean;
  /** Must keep a stable identity: rows use it in effect deps. */
  onToggleExpand: (id: string) => void;
  childrenIndex: ChildrenIndex;
  /** Flat folder list, used by `canDrop` to check for cycles. */
  folders: FileTreeFolder[];
  onPreview: (noteId: string) => void;
  previewId: string | null;
  mutations: ReturnType<typeof useFileMutations>;
  /** DnD is off on non-desktop viewports. */
  isDesktop: boolean;
};

/**
 * Holds what every tree level needs, so rows get only their own item and depth as props.
 * FilesTable provides it; the value is memoised there.
 */

export const FilesTreeContext = createContext<FilesTreeContextValue | null>(null);

export function useFilesTree(): FilesTreeContextValue {
  const value = useContext(FilesTreeContext);
  if (!value) throw new Error('useFilesTree must be used inside <FilesTreeContext.Provider>');
  return value;
}
