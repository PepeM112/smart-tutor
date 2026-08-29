'use client';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

import type { ReactNode } from 'react';

type QueryStateProps = {
  /** Mirrors `useQuery`/`useMutation`'s `isLoading`. */
  isLoading: boolean;
  /** Mirrors `useQuery`/`useMutation`'s `isError`. */
  isError: boolean;
  /**
   * The raw query error, kept for callers that want to inspect or log it.
   * Not rendered directly — the visible text always comes from `errorMessage`,
   * since every page shows its own translated (next-intl) copy.
   */
  error?: Error | null;
  /** Translated text shown when `isError` is true. */
  errorMessage: ReactNode;
  /** Success content, rendered once loading has finished and no error occurred. */
  children: ReactNode;
};

/**
 * Shared replacement for the `isLoading ? <Spinner /> : isError ? <Error /> : <Content />`
 * ternary that was hand-rolled across list and detail pages. Standardises on the existing
 * `LoadingSpinner` and a bare muted-foreground error paragraph, so every page gets the same
 * loading/error treatment instead of slightly different paddings/icon sizes per page.
 */
export function QueryState({ isLoading, isError, errorMessage, children }: QueryStateProps) {
  if (isLoading) {
    return (
      <div data-slot="query-state">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div data-slot="query-state">
        <p className="text-muted-foreground">{errorMessage}</p>
      </div>
    );
  }

  return <div data-slot="query-state">{children}</div>;
}
