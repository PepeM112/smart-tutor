'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { invalidateAfterFileChange } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { noteHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

type ImportNoteButtonProps = {
  compact?: boolean;
  folderId?: string | null;
};

export function ImportNoteButton({ compact = false, folderId }: ImportNoteButtonProps) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: createNote, isPending: isImporting } = useMutation({
    mutationFn: (vars: { title: string; content: string }) =>
      sdk.notesCreate({ body: { title: vars.title, content: vars.content, folderId: folderId ?? undefined } }),
    onSuccess: res => {
      invalidateAfterFileChange(queryClient, { notes: true, refetchNotes: true });
      toast.success(t('notes.note_imported'));
      if (!res.data) return;
      router.push(noteHref(res.data));
    },
    onError: err => toast.error(getErrorDetail(err, t('notes.failed_to_import'))),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      // SAFETY: readAsText always produces a string result on success
      const content = reader.result as string;
      const title = file.name.replace(/\.md$/i, '');
      createNote({ title, content });
    };
    reader.onerror = () => toast.error(t('notes.failed_to_read_file'));
    reader.readAsText(file);

    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown"
        className="hidden"
        onChange={handleFileChange}
        disabled={isImporting}
      />
      <Button
        variant="outline"
        size={compact ? 'icon-lg' : 'lg'}
        icon={Upload}
        onClick={() => fileRef.current?.click()}
        disabled={isImporting}
        tooltip={compact ? (isImporting ? t('notes.importing') : t('common.import')) : undefined}
      >
        {!compact && (isImporting ? t('notes.importing') : t('common.import'))}
      </Button>
    </>
  );
}
