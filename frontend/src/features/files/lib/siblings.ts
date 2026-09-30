import { folderHref, noteHref } from '@/lib/routes';

import { type ChildrenIndex } from './fileTree';

export type SiblingEntry = { id: string; name: string; href: string; isCurrent: boolean };

// Builders for the SiblingCard list.
// The tree is already in memory, so no fetch is needed on hover.
// The backend sorts folders by lower(name) and notes by lower(title): no client re-sort.

export function folderSiblings(
  childrenIndex: ChildrenIndex,
  parentId: string | null,
  currentId: string
): SiblingEntry[] {
  return (childrenIndex.get(parentId)?.folders ?? []).map(f => ({
    id: f.id,
    name: f.name,
    href: folderHref(f),
    isCurrent: f.id === currentId,
  }));
}

export function noteSiblings(childrenIndex: ChildrenIndex, folderId: string | null, currentId: string): SiblingEntry[] {
  return (childrenIndex.get(folderId)?.notes ?? []).map(n => ({
    id: n.id,
    name: n.title || '',
    href: noteHref({ id: n.id, title: n.title }),
    isCurrent: n.id === currentId,
  }));
}
