import { useQuery } from '@tanstack/react-query';

import type { AnswerRead } from '@/client';
import { sdk } from '@/lib/api-client';

const POLL_INTERVAL_MS = 3000;

function hasPendingChallenges(answers?: AnswerRead[]): boolean {
  if (!answers) return false;
  return answers.some(
    a => a.rubricResult?.some(r => r.challengeResult != null && r.challengeResult.met == null) ?? false
  );
}

export function useTestResult(resultId: string | null) {
  return useQuery({
    queryKey: ['results', resultId],
    queryFn: () => sdk.resultsGet({ path: { result_id: resultId! } }),
    enabled: !!resultId,
    refetchInterval: query => {
      const data = query.state.data?.data;
      if (!data) return false;
      if ((data.pendingAnswers ?? 0) > 0) return POLL_INTERVAL_MS;
      if (hasPendingChallenges(data.answers)) return POLL_INTERVAL_MS;
      return false;
    },
  });
}
