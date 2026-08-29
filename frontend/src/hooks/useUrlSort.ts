import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

type SortState = {
  column: string | null;
  order: 'asc' | 'desc' | null;
};

type UseUrlSortReturn<T extends string> = {
  sort: SortState;
  sortBy: T | undefined;
  sortOrder: 'asc' | 'desc' | undefined;
  handleSort: (column: string | null, order: 'asc' | 'desc' | null) => void;
};

export function useUrlSort<T extends string>(
  validSortKeys: readonly T[],
  onSortChange?: () => void
): UseUrlSortReturn<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawSortBy = searchParams.get('sort_c');
  const rawSortOrder = searchParams.get('sort_o');

  const sortBy = rawSortBy && (validSortKeys as readonly string[]).includes(rawSortBy) ? (rawSortBy as T) : undefined;

  const sortOrder = rawSortOrder === 'asc' || rawSortOrder === 'desc' ? rawSortOrder : undefined;

  const handleSort = useCallback(
    (column: string | null, order: 'asc' | 'desc' | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (column && order) {
        params.set('sort_c', column);
        params.set('sort_o', order);
      } else {
        params.delete('sort_c');
        params.delete('sort_o');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      onSortChange?.();
    },
    [searchParams, pathname, router, onSortChange]
  );

  const sort = useMemo<SortState>(() => ({ column: sortBy ?? null, order: sortOrder ?? null }), [sortBy, sortOrder]);

  return { sort, sortBy, sortOrder, handleSort };
}
