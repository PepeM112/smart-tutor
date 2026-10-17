import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { sdk } from '@/lib/apiClient';
import { courseHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

import { applyCourseDetail } from '../lib/queryKeys';

/** Join with a code (any visibility) and open the course. Used by the dialog and by `/courses/join/[code]`. */
export function useJoinByCode(onJoined?: () => void) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) =>
      (await sdk.spacesJoinByCode({ body: { code: code.trim() }, throwOnError: true })).data,
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      toast.success(t('courses.joined'));
      onJoined?.();
      router.push(courseHref(detail));
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_join'))),
  });
}
