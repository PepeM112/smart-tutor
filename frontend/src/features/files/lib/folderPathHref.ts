import { type FileTreeFolder } from '@/client';
import { folderHref, Routes } from '@/lib/routes';

/** Where Back goes from an item in the last folder of `path` (root to parent): that folder, or Files at the root. */
export function folderPathHref(path: FileTreeFolder[]): string {
  const parent = path.at(-1);
  return parent ? folderHref(parent) : Routes.FILES;
}
