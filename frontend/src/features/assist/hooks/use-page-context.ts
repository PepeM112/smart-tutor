'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import type { PageContext } from '../types';

const RESOURCE_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /^\/notes\/([^/]+)/, type: 'note' },
  { pattern: /^\/tests\/([^/]+)/, type: 'test' },
  { pattern: /^\/questions\/([^/]+)/, type: 'question' },
  { pattern: /^\/history\/([^/]+)/, type: 'result' },
];

export function usePageContext(): PageContext {
  const pathname = usePathname();

  return useMemo(() => {
    const ctx: PageContext = { route: pathname };

    for (const { pattern, type } of RESOURCE_PATTERNS) {
      const match = pathname.match(pattern);
      if (match?.[1] && match[1] !== 'new' && match[1] !== 'generate') {
        ctx.resourceType = type;
        ctx.resourceId = match[1];
        break;
      }
    }

    return ctx;
  }, [pathname]);
}
