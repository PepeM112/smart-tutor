'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  FilterType,
  deserializeFilterValue,
  serializeFilterValue,
  type FilterItem,
  type FilterValue,
} from '@/lib/filters';

export function useFilters(filterList: FilterItem[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHydrating = useRef(true);
  const searchParamsRef = useRef(searchParams);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const allQueryKeys = useRef(
    new Set(
      filterList.flatMap(item => {
        const key = item.query ?? item.key;
        const staticKeys = item.type === FilterType.DATE ? [`${key}_from`, `${key}_to`] : [key];
        if (!item.serializer) return staticKeys;
        const probeResult = item.serializer({ [item.key]: '' });
        return [...staticKeys, ...Object.keys(probeResult)];
      })
    )
  );

  const [filters, setFilters] = useState<FilterValue>(() => hydrateFromUrl(filterList, searchParams));

  useEffect(() => {
    if (isHydrating.current) {
      isHydrating.current = false;
      return;
    }

    const currentParams = searchParamsRef.current;
    const serialized = filterList.flatMap(item => Object.entries(serializeFilterValue(item, filters)));
    const producedKeys = new Set(serialized.map(([key]) => key));
    const params = new URLSearchParams(currentParams.toString());

    allQueryKeys.current.forEach(key => {
      if (!producedKeys.has(key)) params.delete(key);
    });

    for (const [key, val] of serialized) {
      params.delete(key);
      if (Array.isArray(val)) {
        val.forEach(v => params.append(key, v));
      } else {
        params.set(key, val);
      }
    }

    params.delete('page');

    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    const currentUrl = currentParams.toString() ? `${pathname}?${currentParams.toString()}` : pathname;
    if (newUrl !== currentUrl) {
      router.replace(newUrl, { scroll: false });
    }
  }, [filters, filterList, pathname, router]);

  const getValue = useCallback(<R>(key: string): R | undefined => filters[key] as R | undefined, [filters]);

  const setFilter = useCallback((key: string, value: FilterValue[string] | undefined) => {
    setFilters(prev => {
      if (value === undefined) {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  return { filters, getValue, setFilter, clearFilters };
}

function hydrateFromUrl(filterList: FilterItem[], params: URLSearchParams): FilterValue {
  const result: FilterValue = {};
  for (const item of filterList) {
    const value = deserializeFilterValue(item, params);
    if (value !== undefined) result[item.key] = value;
  }
  return result;
}
