'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { parseNoteId } from '@/lib/routes';

import { usePageData } from '../context/PageDataContext';

import type { PageContext } from '../types';

const RESOURCE_PATTERNS: { pattern: RegExp; type: string; parseId?: (raw: string) => string }[] = [
  // Note URLs may be slug-prefixed: /notes/<slug>-<ulid>
  { pattern: /^\/notes\/([^/]+)/, type: 'note', parseId: parseNoteId },
  { pattern: /^\/tests\/([^/]+)/, type: 'test' },
  { pattern: /^\/questions\/([^/]+)/, type: 'question' },
  { pattern: /^\/history\/([^/]+)/, type: 'result' },
];

export function usePageContext(): PageContext {
  const pathname = usePathname();
  const { contextData } = usePageData();

  return useMemo(() => {
    const ctx: PageContext = { route: pathname };

    for (const { pattern, type, parseId } of RESOURCE_PATTERNS) {
      const match = pathname.match(pattern);
      if (match?.[1] && match[1] !== 'new' && match[1] !== 'generate') {
        ctx.resourceType = type;
        ctx.resourceId = parseId ? parseId(match[1]) : match[1];
        break;
      }
    }

    if (contextData) {
      ctx.contextData = contextData;
    }

    return ctx;
  }, [pathname, contextData]);
}
