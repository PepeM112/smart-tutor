'use client';

import { useQuery } from '@tanstack/react-query';
import { Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { sdk } from '@/lib/apiClient';

import { useFileMutations } from '../hooks/useFileMutations';

import { FolderTreeRow, NoteTreeRow } from './FileTreeRow';

type Props = {
  currentFolderId: string | null;
  onPreview: (noteId: string) => void;
  previewId: string | null;
};

/**
 * Notion-style tree table for the Files page.
 * Root-level items (from currentFolderId's contents) are rendered flat.
 * Folder rows lazy-fetch and expand inline when the chevron is clicked.
 * Expanded IDs are local state; it never escapes this component.
 */
export function FilesTable({ currentFolderId, onPreview, previewId }: Props) {
  const t = useTranslations();

  const { data: contentsRes, isLoading } = useQuery({
    queryKey: ['folders', 'contents', currentFolderId],
    queryFn: () => sdk.foldersContents({ query: { folder_id: currentFolderId } }),
  });

  const folders = contentsRes?.data?.folders ?? [];
  const notes = contentsRes?.data?.notes ?? [];
  const isEmpty = !isLoading && folders.length === 0 && notes.length === 0;

  // Immutable set of expanded folder IDs — toggled by FolderTreeRow.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function handleToggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const mutations = useFileMutations({ currentFolderId });

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Folder className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {currentFolderId ? t('files.empty_folder') : t('files.empty_root')}
        </p>
      </div>
    );
  }

  return (
    <div role="treegrid" aria-label={t('files.title')} className="w-full">
      {/* Header row */}
      <div
        role="row"
        className="flex items-center gap-2 border-b border-border py-1 pr-2 text-xs font-medium text-muted-foreground"
        style={{ paddingLeft: '28px' }}
      >
        <span className="flex-1">{t('files.col_name')}</span>
        <span className="hidden w-24 text-right sm:block">{t('files.col_updated')}</span>
        {/* Spacer matching the action buttons area */}
        <span className="w-16 shrink-0" />
      </div>

      {/* Tree rows */}
      <div className="py-1">
        {folders.map(folder => (
          <FolderTreeRow
            key={folder.id}
            folder={folder}
            depth={0}
            expanded={expanded}
            onToggleExpand={handleToggleExpand}
            onPreview={onPreview}
            previewId={previewId}
            mutations={mutations}
          />
        ))}
        {notes.map(note => (
          <NoteTreeRow
            key={note.id}
            note={note}
            depth={0}
            onPreview={onPreview}
            previewId={previewId}
            mutations={mutations}
          />
        ))}
      </div>
    </div>
  );
}
