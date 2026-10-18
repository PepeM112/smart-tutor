import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SpaceKind } from '@/client';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { applyCourseDetail } from '../lib/queryKeys';
import { spaceHref } from '../lib/spaceHref';

/** Join with a code (any visibility) and open the course or the classroom. Used by the dialog and by `/courses/join/[code]`. */
export function useJoinByCode(onJoined?: () => void) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) =>
      (await sdk.spacesJoinByCode({ body: { code: code.trim() }, throwOnError: true })).data,
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      toast.success(t(detail.kind === SpaceKind.CLASSROOM ? 'classrooms.joined' : 'courses.joined'));
      onJoined?.();
      router.push(spaceHref(detail));
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_join'))),
  });
}
