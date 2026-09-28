'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { GenerateNoteDialog } from '@/features/notes/components/GenerateNoteDialog';
import { ImportNoteButton } from '@/features/notes/components/ImportNoteButton';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { sdk } from '@/lib/apiClient';
import { folderHref, noteHref, Routes } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';
import { type BreadcrumbItem } from '@/store/useBreadcrumbStore';

import { FilesList } from './FilesList';
import { NewFolderDialog } from './FolderNameDialog';

type Props = {
  /** null = root, string = folder ID */
  folderId: string | null;
};

/** Build the breadcrumb trail from the flat folder list. */
function buildBreadcrumbs(
  folderId: string | null,
  allFolders: Array<{ id: string; name: string; parentId: string | null }>,
  rootLabel: string
): BreadcrumbItem[] {
  if (!folderId) return [];
  const crumbs: BreadcrumbItem[] = [];
  let current: { id: string; name: string; parentId: string | null } | undefined = allFolders.find(
    f => f.id === folderId
  );
  while (current) {
    crumbs.unshift({ label: current.name, href: folderHref(current) });
    const parentId = current.parentId;
    current = parentId ? allFolders.find(f => f.id === parentId) : undefined;
  }
  // Add root as the first crumb linking to /files
  crumbs.unshift({ label: rootLabel, href: Routes.FILES });
  // The last entry is the current page — remove its href so it renders as plain text
  if (crumbs.length > 0) {
    crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label };
  }
  return crumbs;
}

export function FilesPage({ folderId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const { data: foldersRes } = useQuery({
    queryKey: ['folders'],
    queryFn: () => sdk.foldersList(),
  });
  const allFolders = useMemo(() => foldersRes?.data ?? [], [foldersRes]);

  const currentFolder = folderId ? allFolders.find(f => f.id === folderId) : null;
  const pageTitle = currentFolder?.name ?? t('files.title');
  const breadcrumbs = useMemo(() => {
    if (!folderId) return [];
    return buildBreadcrumbs(folderId, allFolders, t('files.title'));
  }, [folderId, allFolders, t]);

  useBreadcrumb(pageTitle, breadcrumbs.length > 0 ? breadcrumbs : undefined);

  const { mutate: createNote, isPending: isCreating } = useMutation({
    mutationFn: () => sdk.notesCreate({ body: { title: '', content: '', tags: [], folderId: folderId ?? undefined } }),
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      void queryClient.invalidateQueries({ queryKey: ['folders', 'contents', folderId] });
      if (res.data) router.push(noteHref(res.data));
    },
    onError: err => toast.error(getErrorDetail(err, t('notes.failed_to_create'))),
  });

  return (
    <div className="space-y-6">
      {/* Toolbar */}
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

      <FilesList currentFolderId={folderId} />

      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} parentId={folderId} />
    </div>
  );
}
