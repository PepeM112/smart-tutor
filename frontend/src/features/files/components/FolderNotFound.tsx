'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Routes } from '@/lib/routes';

/** Shown when the folder list has loaded but the folder is absent (trashed or never existed). */
export function FolderNotFound() {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <p className="text-sm text-muted-foreground">{t('files.folder_not_found')}</p>
      <Link href={Routes.FILES} className="text-sm text-primary underline hover:no-underline">
        {t('files.back_to_files')}
      </Link>
    </div>
  );
}
