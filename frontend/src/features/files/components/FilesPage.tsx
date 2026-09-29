'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { SplitPane } from '@/components/shared/SplitPane';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { GenerateNoteDialog } from '@/features/notes/components/GenerateNoteDialog';
import { ImportNoteButton } from '@/features/notes/components/ImportNoteButton';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { sdk } from '@/lib/apiClient';
import { noteHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

import { useFileMutations } from '../hooks/useFileMutations';
import { useFolderPath } from '../hooks/useFolderPath';
import { invalidateAfterFileChange } from '../lib/queryKeys';

import { FileBreadcrumb } from './FileBreadcrumb';
import { FilePageShell } from './FilePageShell';
import { FilesTable } from './FilesTable';
import { NewFolderDialog } from './FolderNameDialog';
import { NotePreviewPanel } from './NotePreviewPanel';

type Props = {
  /** null = root /files, string = folder ID */
  folderId: string | null;
};

export function FilesPage({ folderId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
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

  // Root page (/files) uses the standard page header; folder pages use FileBreadcrumb.
  useBreadcrumb(folderId === null ? t('files.title') : '');

  // Full ancestor chain (root → current folder inclusive) for FileBreadcrumb.
  const folderPath = useFolderPath(folderId);
  const currentFolder = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;

  const { renameFolder } = useFileMutations();

  const { mutate: createNote, isPending: isCreating } = useMutation({
    mutationFn: () => sdk.notesCreate({ body: { title: '', content: '', tags: [], folderId: folderId ?? undefined } }),
    onSuccess: res => {
      invalidateAfterFileChange(queryClient, { notes: true });
      if (res.data) router.push(noteHref(res.data));
    },
    onError: err => toast.error(getErrorDetail(err, t('notes.failed_to_create'))),
  });

  // ── Toolbar ──────────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-row flex-wrap items-center justify-end gap-2">
      <Button variant="outline" size="lg" icon={FolderPlus} onClick={() => setNewFolderOpen(true)}>
        {t('files.new_folder')}
      </Button>
      <ImportNoteButton compact folderId={folderId} />
      <GenerateNoteDialog compact folderId={folderId} />
      <Button size="lg" icon={Plus} onClick={() => createNote()} disabled={isCreating}>
        {t('files.new_note')}
      </Button>
    </div>
  );

  // ── Preview panel ────────────────────────────────────────────────────────────

  const previewPanel = previewId ? <NotePreviewPanel noteId={previewId} onClose={() => setPreviewId(null)} /> : null;

  // ── Table ────────────────────────────────────────────────────────────────────

  const table = <FilesTable currentFolderId={folderId} onPreview={setPreviewId} previewId={previewId} />;

  // ── Layout: desktop SplitPane, mobile drawer ─────────────────────────────────

  const contentArea = (
    <>
      {isDesktop ? (
        <SplitPane storageKey="files-preview-split-ratio" defaultRatio={0.55} main={table} side={previewPanel} />
      ) : (
        <>
          <div className="overflow-y-auto">{table}</div>
          <Drawer open={!!previewId} onOpenChange={open => !open && setPreviewId(null)}>
            <DrawerContent className="max-h-[75dvh]">
              {previewId && <NotePreviewPanel noteId={previewId} onClose={() => setPreviewId(null)} />}
            </DrawerContent>
          </Drawer>
        </>
      )}
    </>
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
