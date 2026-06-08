import { useQuery } from '@tanstack/react-query';

import { sdk } from '@/lib/api-client';

const POLL_INTERVAL_MS = 3000;

export function useTestResult(resultId: string | null) {
  return useQuery({
    queryKey: ['results', resultId],
    queryFn: () => sdk.resultsGet({ path: { result_id: resultId! } }),
    enabled: !!resultId,
    refetchInterval: query => ((query.state.data?.data?.pendingAnswers ?? 0) > 0 ? POLL_INTERVAL_MS : false),
  });
}
