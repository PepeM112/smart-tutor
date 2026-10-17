import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * The active tab in `?tab=`, so a link or Back opens the same tab. An unknown value gives `fallback`.
 * `replace` adds no history entry per click. The page needs a `<Suspense>` (it reads the search params).
 */
export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T): [T, (value: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = tabs.find(value => value === searchParams.get('tab')) ?? fallback;

  const changeTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  return [tab, changeTab];
}
