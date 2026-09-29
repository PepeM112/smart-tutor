'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { parseSlugId } from '@/lib/routes';

import { usePageData } from '../context/PageDataContext';

import type { PageContext } from '../types';

const RESOURCE_PATTERNS: { pattern: RegExp; type: string; parseId?: (raw: string) => string }[] = [
  // Note URLs may be slug-prefixed: /notes/<slug>-<ulid>
  { pattern: /^\/notes\/([^/]+)/, type: 'note', parseId: parseSlugId },
  { pattern: /^\/tests\/([^/]+)/, type: 'test' },
  { pattern: /^\/questions\/([^/]+)/, type: 'question' },
  { pattern: /^\/history\/([^/]+)/, type: 'result' },
  // Folder URLs may be slug-prefixed: /files/<slug>-<ulid>
  { pattern: /^\/files\/([^/]+)/, type: 'folder', parseId: parseSlugId },
  { pattern: /^\/trash$/, type: 'trash' },
];

export function usePageContext(): PageContext {
  const pathname = usePathname();
  const { contextData } = usePageData();

  return useMemo(() => {
    const ctx: PageContext = { route: pathname };

    const resource = RESOURCE_PATTERNS.map(({ pattern, type, parseId }) => ({
      type,
      parseId,
      id: pathname.match(pattern)?.[1],
    })).find(({ id }) => id && id !== 'new' && id !== 'generate');
    if (resource?.id) {
      ctx.resourceType = resource.type;
      ctx.resourceId = resource.parseId ? resource.parseId(resource.id) : resource.id;
    }

    if (contextData) {
      ctx.contextData = contextData;
    }

    return ctx;
  }, [pathname, contextData]);
}
