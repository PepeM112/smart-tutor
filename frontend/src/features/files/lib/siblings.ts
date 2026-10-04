import { folderHref, noteHref } from '@/lib/routes';

import { type ChildrenIndex } from './fileTree';

export type SiblingEntry = { id: string; name: string; href: string };

// Builders for the SiblingCard list.
// The tree is already in memory, so no fetch is needed on hover.
// The backend sorts folders by lower(name) and notes by lower(title): no client re-sort.
// The current item is left out: the breadcrumb already shows it, so it is not an option to go to.

export function folderSiblings(
  childrenIndex: ChildrenIndex,
  parentId: string | null,
  currentId: string
): SiblingEntry[] {
  return (childrenIndex.get(parentId)?.folders ?? [])
    .filter(f => f.id !== currentId)
    .map(f => ({ id: f.id, name: f.name, href: folderHref(f) }));
}

export function noteSiblings(childrenIndex: ChildrenIndex, folderId: string | null, currentId: string): SiblingEntry[] {
  return (childrenIndex.get(folderId)?.notes ?? [])
    .filter(n => n.id !== currentId)
    .map(n => ({ id: n.id, name: n.title || '', href: noteHref({ id: n.id, title: n.title }) }));
}
