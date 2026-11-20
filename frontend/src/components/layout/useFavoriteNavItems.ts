import { Star } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useFileTree } from '@/features/files/hooks/useFileTree';
import { displayTitle } from '@/lib/displayTitle';
import { noteHref, parseSlugId } from '@/lib/routes';

import { type NavItem } from './navItems';

/** The favorite notes as nav items, newest favorite first. Empty when there are none. */
export function useFavoriteNavItems(): NavItem[] {
  const t = useTranslations();
  const pathname = usePathname();
  const { notes } = useFileTree();

  return useMemo<NavItem[]>(() => {
    const openNoteId = activeNoteId(pathname);
    return notes
      .filter(note => note.isFavorite)
      .sort((a, b) => (b.favoritedAt?.getTime() ?? 0) - (a.favoritedAt?.getTime() ?? 0))
      .map(note => ({
        labelKey: `favorite-${note.id}`,
        label: displayTitle(note.title, t),
        href: noteHref(note),
        icon: Star,
        isActive: note.id === openNoteId,
      }));
  }, [notes, pathname, t]);
}

/** The note id of a `/notes/<slug>-<id>` path, or null on any other path. */
function activeNoteId(pathname: string): string | null {
  if (!pathname.startsWith('/notes/')) return null;
  const segment = pathname.split('/')[2];
  return segment ? parseSlugId(segment) : null;
}
