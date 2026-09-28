'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tooltip } from 'radix-ui';
import { useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* One provider for the whole app: with one provider per hint, `skipDelayDuration` never
          applied, because each hint had its own timer. Now moving between hints shows them at once. */}
      <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
        {children}
      </Tooltip.Provider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
