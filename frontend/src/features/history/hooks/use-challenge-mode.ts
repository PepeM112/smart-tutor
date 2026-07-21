import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { RubricResultItem } from '@/client';
import { sdk } from '@/lib/api-client';

export function useChallengeMode(items: RubricResultItem[], answerId: string) {
  const t = useTranslations('challenge');
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [selectedCriteria, setSelectedCriteria] = useState<Map<number, string>>(new Map());
  const queryClient = useQueryClient();

  const { mutate: submitChallenge, isPending: isSubmitting } = useMutation({
    mutationFn: () =>
      sdk.answersChallenge({
        path: { answer_id: answerId },
        body: {
          criteria: Array.from(selectedCriteria.entries()).map(([criterionIndex, argument]) => ({
            criterionIndex,
            argument,
          })),
        },
      }),
    onSuccess: () => {
      toast.success(t('challenge_submitted'));
      setIsChallengeMode(false);
      setSelectedCriteria(new Map());
      void queryClient.invalidateQueries({ queryKey: ['results'] });
    },
    onError: (error: Error & { status?: number; body?: { detail?: string } }) => {
      const detail = error.body?.detail ?? error.message;
      toast.error(t('challenge_failed', { error: detail }));
    },
  });

  const hasUnchallengedFailedCriteria = items.some(item => !item.met && item.challengeResult == null);
  const hasPendingChallenge = items.some(item => item.challengeResult != null && item.challengeResult.met == null);
  const canChallenge = hasUnchallengedFailedCriteria && !hasPendingChallenge;

  // Toast when a pending challenge resolves
  const wasPending = useRef(false);
  useEffect(() => {
    if (hasPendingChallenge) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      const overturned = items.filter(i => i.challengeResult?.met === true).length;
      if (overturned > 0) {
        toast.success(t('challenge_overturned', { count: overturned }));
      } else {
        toast.info(t('challenge_upheld'));
      }
    }
  }, [hasPendingChallenge, items, t]);

  const exitChallengeMode = useCallback(() => {
    setIsChallengeMode(false);
    setSelectedCriteria(new Map());
  }, []);

  // Escape key exits challenge mode
  useEffect(() => {
    if (!isChallengeMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') exitChallengeMode();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isChallengeMode, exitChallengeMode]);

  const canSubmit =
    selectedCriteria.size > 0 && Array.from(selectedCriteria.values()).every(arg => arg.trim().length > 0);

  function toggleCriterion(idx: number) {
    setSelectedCriteria(prev => {
      const next = new Map(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.set(idx, '');
      }
      return next;
    });
  }

  function updateArgument(idx: number, value: string) {
    setSelectedCriteria(prev => {
      const next = new Map(prev);
      next.set(idx, value);
      return next;
    });
  }

  return {
    isChallengeMode,
    enterChallengeMode: () => setIsChallengeMode(true),
    exitChallengeMode,
    selectedCriteria,
    toggleCriterion,
    updateArgument,
    submitChallenge,
    isSubmitting,
    canChallenge,
    canSubmit,
    hasPendingChallenge,
  };
}
