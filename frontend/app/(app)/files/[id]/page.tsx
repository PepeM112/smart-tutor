'use client';

import { useQuery } from '@tanstack/react-query';
import { use, useMemo } from 'react';

import { FilesPage } from '@/features/files/components/FilesPage';
import { FolderNotFound } from '@/features/files/components/FolderNotFound';
import { useCanonicalFolderUrl } from '@/features/files/hooks/useCanonicalFolderUrl';
import { sdk } from '@/lib/apiClient';
import { parseSlugId } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function FolderDetailPage({ params }: Props) {
  const { id } = use(params);
  const folderId = parseSlugId(id);

  const { data: foldersRes, isSuccess } = useQuery({
    queryKey: ['folders'],
    queryFn: () => sdk.foldersList(),
  });

  const folder = useMemo(() => foldersRes?.data?.find(f => f.id === folderId) ?? null, [foldersRes, folderId]);

  useCanonicalFolderUrl(folder, id);

  // Show a "not found" state when the folder list has loaded but this ID is absent
  // (trashed or never existed).
  if (isSuccess && !folder) {
    return <FolderNotFound />;
  }

  return <FilesPage folderId={folderId} />;
}
