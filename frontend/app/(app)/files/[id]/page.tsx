'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { use, useEffect, useMemo } from 'react';

import { FilesPage } from '@/features/files/components/FilesPage';
import { sdk } from '@/lib/apiClient';
import { parseFolderId, folderHref, Routes } from '@/lib/routes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function FolderDetailPage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations();
  const folderId = parseFolderId(id);

  // Canonicalize slug in the URL (cheap, no navigation)
  const { data: foldersRes, isSuccess } = useQuery({
    queryKey: ['folders'],
    queryFn: () => sdk.foldersList(),
  });

  const folder = useMemo(() => foldersRes?.data?.find(f => f.id === folderId) ?? null, [foldersRes, folderId]);

  useEffect(() => {
    if (!folder) return;
    const canonical = folderHref(folder).replace('/files/', '');
    if (id !== canonical) {
      window.history.replaceState(null, '', folderHref(folder));
    }
  }, [folder, id]);

  // Show a "not found" state when the folder list has loaded but this ID is absent
  // (trashed or never existed).
  if (isSuccess && !folder) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-sm text-muted-foreground">{t('files.folder_not_found')}</p>
        <Link href={Routes.FILES} className="text-sm text-primary underline hover:no-underline">
          {t('files.back_to_files')}
        </Link>
      </div>
    );
  }

  return <FilesPage folderId={folderId} />;
}
