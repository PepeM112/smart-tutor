'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { GenerateNoteDialog } from '@/features/notes/components/GenerateNoteDialog';
import { ImportNoteButton } from '@/features/notes/components/ImportNoteButton';
import { sdk } from '@/lib/apiClient';
import { noteHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

import { invalidateAfterFileChange } from '../lib/queryKeys';

type Props = {
  /** null = root /files, string = folder ID. New folders and notes are created here. */
  folderId: string | null;
  onNewFolder: () => void;
};

/** New folder, import, generate and new note buttons of a files page. They go in the page header. */
export function FilesToolbar({ folderId, onNewFolder }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: createNote, isPending: isCreating } = useMutation({
    mutationFn: () => sdk.notesCreate({ body: { title: '', content: '', tags: [], folderId: folderId ?? undefined } }),
    onSuccess: res => {
      invalidateAfterFileChange(queryClient, { notes: true });
      if (res.data) router.push(noteHref(res.data));
    },
    onError: err => toast.error(getErrorDetail(err, t('notes.failed_to_create'))),
  });

  return (
    <>
      <Button variant="outline" icon={FolderPlus} aria-label={t('files.new_folder')} onClick={onNewFolder}>
        <span className="hidden lg:inline">{t('files.new_folder')}</span>
      </Button>
      <ImportNoteButton compact folderId={folderId} />
      <GenerateNoteDialog compact folderId={folderId} />
      <Button icon={Plus} aria-label={t('files.new_note')} onClick={() => createNote()} disabled={isCreating}>
        <span className="hidden lg:inline">{t('files.new_note')}</span>
      </Button>
    </>
  );
}
