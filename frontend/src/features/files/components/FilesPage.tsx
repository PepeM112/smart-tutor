'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { SearchInput } from '@/components/shared/SearchInput';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { formatFilesView } from '@/features/assist/utils/formatPageData';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useRowPreview } from '@/hooks/useRowPreview';

import { useFileMutations } from '../hooks/useFileMutations';
import { useFileTree } from '../hooks/useFileTree';
import { useFolderPath } from '../hooks/useFolderPath';
import { filterTree } from '../lib/fileTree';

import { FileBreadcrumb } from './FileBreadcrumb';
import { FilePageShell } from './FilePageShell';
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

  // Root page (/files) uses the standard page header; folder pages use FileBreadcrumb.
  useBreadcrumb(folderId === null ? t('files.title') : '');

  // Full ancestor chain (root → current folder inclusive) for FileBreadcrumb.
  const folderPath = useFolderPath(folderId);
  const currentFolder = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;

  const { renameFolder } = useFileMutations();

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

  const searchInput = <SearchInput value={search} onChange={setSearch} placeholder={t('files.search_placeholder')} />;

  const toolbar = <FilesToolbar folderId={folderId} onNewFolder={() => setNewFolderOpen(true)} />;

  // ── Preview panel ────────────────────────────────────────────────────────────

  const previewPanel = previewId ? <NotePreviewPanel noteId={previewId} onClose={closePreview} /> : null;

  // ── Table ────────────────────────────────────────────────────────────────────

  const table = (
    <FilesTable
      currentFolderId={folderId}
      onPreview={openPreview}
      previewId={previewId}
      query={search}
      filter={filter}
    />
  );

  // ── Layout: desktop SplitPane, mobile drawer ─────────────────────────────────

  const contentArea = (
    <ResponsiveSplitPane
      storageKey="files-preview-split-ratio"
      defaultRatio={0.6}
      // The list scrolls at the page edge (the layout padding moves inside the pane).
      bleed
      main={table}
      side={previewPanel}
      onSideClose={closePreview}
      // The preview panel has its own frame and scroll.
      insetDrawerBody={false}
    />
  );

  // ── Root /files page ─────────────────────────────────────────────────────────
  // Keeps the standard PageHeader via useBreadcrumb; toolbar above the table.

  if (folderId === null) {
    return (
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-48 max-w-150 flex-1">{searchInput}</div>
          <div className="ml-auto">{toolbar}</div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{contentArea}</div>
        <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} parentId={null} />
      </div>
    );
  }

  // ── Folder page ──────────────────────────────────────────────────────────────
  // Uses FilePageShell: standard top bar (breadcrumb + toolbar), content fills remaining height.

  return (
    <FilePageShell
      breadcrumb={
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
        ) : null
      }
      actions={toolbar}
      search={searchInput}
    >
      {contentArea}
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} parentId={folderId} />
    </FilePageShell>
  );
}
