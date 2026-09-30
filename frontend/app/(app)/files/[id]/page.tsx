'use client';

import { use } from 'react';

import { FilesPage } from '@/features/files/components/FilesPage';
import { FolderNotFound } from '@/features/files/components/FolderNotFound';
import { useCanonicalFolderUrl } from '@/features/files/hooks/useCanonicalFolderUrl';
import { useFolders } from '@/features/files/hooks/useFolders';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function FolderDetailPage({ params }: Props) {
  const { id } = use(params);
  const folderId = parseSlugId(id);

  const { foldersById, isLoading, isFetching, isError } = useFolders();
  const folder = foldersById.get(folderId) ?? null;

  useCanonicalFolderUrl(folder, id);

  // Wait for any fetch to end. A stale tree can miss a new or restored folder.
  // On error, FilesPage shows its own error state.
  if (!folder && !isLoading && !isFetching && !isError) {
    return <FolderNotFound />;
  }

  return <FilesPage folderId={folderId} />;
}
