import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { type TestResultRead } from '@/client';
import { classroomQueryKeys } from '@/features/classrooms/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { overrideErrorText } from '../utils/overrideErrors';

/** The cached result query holds the SDK response; the override calls return the new result. */
function replaceResult(old: unknown, result: TestResultRead): unknown {
  return typeof old === 'object' && old !== null ? { ...old, data: result } : old;
}

/** Set or clear the teacher grade of one answer. The response is the whole result, so the cache is replaced. */
export function useAnswerOverride(resultId: string) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const onSaved = (result: TestResultRead, message: string): void => {
    queryClient.setQueryData(['results', resultId], (old: unknown) => replaceResult(old, result));
    // The history list has the score. The gradebook has the best score and the status.
    void queryClient.invalidateQueries({
      predicate: query => query.queryKey[0] === 'results' && query.queryKey[1] !== resultId,
    });
    void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.gradebooks() });
    toast.success(message);
  };

  const onFailed = (error: unknown): void => {
    const text = overrideErrorText(getErrorDetail(error, ''));
    toast.error(text ? t(`history.${text.key}`, text.values) : t('history.override_failed'));
  };

  const { mutate: setOverride, isPending: isSettingOverride } = useMutation({
    mutationFn: async ({ answerId, score }: { answerId: string; score: number }): Promise<TestResultRead> =>
      (await sdk.answersSetOverride({ path: { answer_id: answerId }, body: { score }, throwOnError: true })).data,
    onSuccess: result => onSaved(result, t('history.override_saved')),
    onError: onFailed,
  });

  const { mutate: clearOverride, isPending: isClearingOverride } = useMutation({
    mutationFn: async (answerId: string): Promise<TestResultRead> =>
      (await sdk.answersClearOverride({ path: { answer_id: answerId }, throwOnError: true })).data,
    onSuccess: result => onSaved(result, t('history.override_cleared')),
    onError: onFailed,
  });

  return { setOverride, isSettingOverride, clearOverride, isClearingOverride };
}
