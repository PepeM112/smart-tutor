'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

import { useFileMutations } from '../hooks/useFileMutations';
import { useFileTree } from '../hooks/useFileTree';
import { useFolderPath } from '../hooks/useFolderPath';

import { FileBreadcrumb } from './FileBreadcrumb';
import { FilePageShell } from './FilePageShell';
import { FilesTable } from './FilesTable';
import { FilesToolbar } from './FilesToolbar';
import { NewFolderDialog } from './FolderNameDialog';
import { NotePreviewPanel } from './NotePreviewPanel';

type Props = {
  /** null = root /files, string = folder ID */
  folderId: string | null;
};

export function FilesPage({ folderId }: Props) {
  const t = useTranslations();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Reset the preview when navigating to a different folder.
  // Using the React "adjust state on prop change" pattern instead of useEffect
  // to avoid a cascading render from setState inside an effect body.
  const [prevFolderId, setPrevFolderId] = useState(folderId);
  if (prevFolderId !== folderId) {
    setPrevFolderId(folderId);
    setPreviewId(null);
  }

  // Show the preview only while its note is still in the tree. A trashed note leaves the tree,
  // so the pane closes by itself (no effect needed).
  const { notes: treeNotes } = useFileTree();
  const activePreviewId = previewId && treeNotes.some(n => n.id === previewId) ? previewId : null;

  // Root page (/files) uses the standard page header; folder pages use FileBreadcrumb.
  useBreadcrumb(folderId === null ? t('files.title') : '');

  // Full ancestor chain (root → current folder inclusive) for FileBreadcrumb.
  const folderPath = useFolderPath(folderId);
  const currentFolder = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;

  const { renameFolder } = useFileMutations();

  const toolbar = <FilesToolbar folderId={folderId} onNewFolder={() => setNewFolderOpen(true)} />;

  // ── Preview panel ────────────────────────────────────────────────────────────

  const previewPanel = activePreviewId ? (
    <NotePreviewPanel noteId={activePreviewId} onClose={() => setPreviewId(null)} />
  ) : null;

  // ── Table ────────────────────────────────────────────────────────────────────

  const table = <FilesTable currentFolderId={folderId} onPreview={setPreviewId} previewId={activePreviewId} />;

  // ── Layout: desktop SplitPane, mobile drawer ─────────────────────────────────

  const contentArea = (
    <ResponsiveSplitPane
      storageKey="files-preview-split-ratio"
      defaultRatio={0.55}
      main={table}
      side={previewPanel}
      onSideClose={() => setPreviewId(null)}
      // The preview panel has its own frame and scroll.
      insetDrawerBody={false}
    />
  );

  // ── Root /files page ─────────────────────────────────────────────────────────
  // Keeps the standard PageHeader via useBreadcrumb; toolbar above the table.

  if (folderId === null) {
    return (
      <div className="flex h-full flex-col gap-4">
        {toolbar}
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
    >
      {contentArea}
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} parentId={folderId} />
    </FilePageShell>
  );
}
