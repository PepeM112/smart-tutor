import { useQuery } from '@tanstack/react-query';

import { sdk } from '@/lib/apiClient';
import { retryUnlessDenied } from '@/lib/utils';

/**
 * The test of a result, as the student took it (a frozen version).
 * The API gives the stripped form (no answer key) when the student may not see the answers yet.
 */
export function useResultTest(resultId: string | null) {
  return useQuery({
    queryKey: ['results', resultId, 'test'],
    queryFn: () => sdk.resultsGetTest({ path: { result_id: resultId! } }),
    enabled: !!resultId,
    retry: retryUnlessDenied,
  });
}
