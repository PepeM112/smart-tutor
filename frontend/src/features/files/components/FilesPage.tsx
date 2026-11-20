'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { SearchInput } from '@/components/shared/SearchInput';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { formatFilesView } from '@/features/assist/utils/formatPageData';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageActions, usePageLead } from '@/hooks/usePageActions';
import { useRowPreview } from '@/hooks/useRowPreview';
import { folderHref, Routes } from '@/lib/routes';

import { useFileMutations } from '../hooks/useFileMutations';
import { useFileTree } from '../hooks/useFileTree';
import { useFolderPath } from '../hooks/useFolderPath';
import { filterTree } from '../lib/fileTree';

import { FileBreadcrumb } from './FileBreadcrumb';
import { FilesTable } from './FilesTable';
import { FilesToolbar } from './FilesToolbar';
import { NewFolderDialog } from './NewFolderDialog';
import { NotePreviewPanel } from './NotePreviewPanel';

type Props = {
  /** null = root /files, string = folder ID */
  folderId: string | null;
};

export function FilesPage({ folderId }: Props) {
  const t = useTranslations();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Reset the search when navigating to a different folder.
  // Using the React "adjust state on prop change" pattern instead of useEffect
  // to avoid a cascading render from setState inside an effect body.
  const [prevFolderId, setPrevFolderId] = useState(folderId);
  if (prevFolderId !== folderId) {
    setPrevFolderId(folderId);
    setSearch('');
  }

  // The preview closes when the folder changes or when its note leaves the tree (trashed).
  const { notes: treeNotes, folders: treeFolders, childrenIndex } = useFileTree();
  const { previewId, openPreview, closePreview } = useRowPreview(treeNotes, folderId ?? '');

  // Full ancestor chain (root → current folder inclusive) for FileBreadcrumb.
  const folderPath = useFolderPath(folderId);
  const currentFolder = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;
  const parentFolder = folderPath.length > 1 ? folderPath[folderPath.length - 2] : null;

  // The root page has the plain title. A folder page puts its path in the desktop header (`lead`); the phone
  // header gets the folder name and a Back to the parent.
  useBreadcrumb(
    folderId === null ? t('files.title') : (currentFolder?.name ?? ''),
    undefined,
    folderId === null ? undefined : parentFolder ? folderHref(parentFolder) : Routes.FILES
  );

  const { renameFolder } = useFileMutations();

  const headerActions = useMemo(
    () => <FilesToolbar folderId={folderId} onNewFolder={() => setNewFolderOpen(true)} />,
    [folderId]
  );
  usePageActions(headerActions);

  const headerLead = useMemo(
    () =>
      currentFolder ? (
        <FileBreadcrumb
          path={folderPath.slice(0, -1)}
          current={{
            kind: 'folder',
            id: currentFolder.id,
            name: currentFolder.name,
            parentId: currentFolder.parentId,
          }}
          onRename={name => renameFolder({ id: currentFolder.id, name })}
        />
      ) : undefined,
    [currentFolder, folderPath, renameFolder]
  );
  usePageLead(headerLead, true);

  // One filter for the table and for the AI page data.
  const filter = useMemo(() => filterTree(childrenIndex, folderId, search), [childrenIndex, folderId, search]);

  const aiPageData = useMemo(() => {
    // With a search: everything visible in the subtree. Without: the direct children of the view.
    const inView = (parentId: string | null): boolean => parentId === folderId;
    const visibleFolders = treeFolders.filter(f => (filter ? filter.visibleIds.has(f.id) : inView(f.parentId)));
    const visibleNotes = treeNotes.filter(n => (filter ? filter.visibleIds.has(n.id) : inView(n.folderId)));
    return formatFilesView(visibleFolders, visibleNotes, currentFolder?.name ?? null);
  }, [filter, folderId, treeFolders, treeNotes, currentFolder?.name]);
  useProvidePageData(aiPageData);

  return (
    <div className="flex h-full flex-col">
      <div role="search" className="flex min-h-12 items-center py-2">
        <SearchInput
          className="w-full sm:w-70"
          value={search}
          onChange={setSearch}
          placeholder={t('files.search_placeholder')}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ResponsiveSplitPane
          storageKey="files-preview-split-ratio"
          defaultRatio={0.6}
          // The list scrolls at the page edge (the layout padding moves inside the pane).
          bleed
          main={
            <FilesTable
              currentFolderId={folderId}
              onPreview={openPreview}
              previewId={previewId}
              query={search}
              filter={filter}
            />
          }
          side={previewId ? <NotePreviewPanel noteId={previewId} onClose={closePreview} /> : null}
          onSideClose={closePreview}
          // The preview panel has its own frame and scroll.
          insetDrawerBody={false}
        />
      </div>
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} parentId={folderId} />
    </div>
  );
}
