import { type TrashTree, type TrashTreeFolder, type TrashTreeNote } from '@/client';
import { buildChildrenIndex, type ChildrenIndex } from '@/features/files/lib/fileTree';

export type TrashSearchIndex = ChildrenIndex<TrashTreeFolder, TrashTreeNote>;

/**
 * Build one children index from the flat list of all trashed items.
 * An item is a "trash root" (a top-level row of the Trash page) when its parent is not in the trash,
 * or when the parent was trashed in a different batch (a different `deletedAt`). Roots get the parent
 * key `null`, so `filterTree(index, null, query)` can search the whole trash like a normal tree.
 */
export function buildTrashIndex(tree: TrashTree): TrashSearchIndex {
  const batchOf = new Map(tree.folders.map(folder => [folder.id, folder.deletedAt.getTime()]));
  const isRoot = (parentId: string | null, deletedAt: Date): boolean =>
    parentId === null || batchOf.get(parentId) !== deletedAt.getTime();

  return buildChildrenIndex({
    folders: tree.folders.map(folder => ({
      ...folder,
      parentId: isRoot(folder.parentId, folder.deletedAt) ? null : folder.parentId,
    })),
    notes: tree.notes.map(note => ({
      ...note,
      folderId: isRoot(note.folderId, note.deletedAt) ? null : note.folderId,
    })),
  });
}
