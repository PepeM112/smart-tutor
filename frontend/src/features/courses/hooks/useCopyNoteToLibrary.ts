import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { NoteRead } from '@/client';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { noteHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

/**
 * "Copy to my library": makes a personal copy of a course note in the root folder.
 * The toast has a link to the copy. The copy does not follow later edits of the course.
 */
export function useCopyNoteToLibrary(noteId: string) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<NoteRead> =>
      (await sdk.notesCopyToLibrary({ path: { note_id: noteId }, throwOnError: true })).data,
    onSuccess: copy => {
      void queryClient.invalidateQueries({ queryKey: fileQueryKeys.notes() });
      toast.success(t('courses.copied_to_library'), {
        action: { label: t('courses.open_copy'), onClick: () => router.push(noteHref(copy)) },
      });
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_copy_note'))),
  });
}
