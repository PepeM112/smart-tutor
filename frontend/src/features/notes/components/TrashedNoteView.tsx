'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { type NoteRead } from '@/client';
import { FileBreadcrumb } from '@/features/files/components/FileBreadcrumb';
import { useFolderPath } from '@/features/files/hooks/useFolderPath';
import { folderPathHref } from '@/features/files/lib/folderPathHref';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { TrashedBanner } from '@/features/trash/components/TrashedBanner';
import { useTrashMutations } from '@/features/trash/hooks/useTrashMutations';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageActions, usePageLead } from '@/hooks/usePageActions';
import { displayTitle } from '@/lib/displayTitle';
import { pageBleed } from '@/lib/pageBleed';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { LazyRichNoteEditor } from '../editor/LazyRichNoteEditor';
import { noteColumnClass, useNoteColumn } from '../hooks/useNoteColumn';

import { NoteWidthToggle } from './NoteWidthToggle';

/**
 * Rendered instead of NoteForm when note.deletedAt is set.
 * No autosave, no AI actions, no move — just a read-only editor + trash banner.
 */
export function TrashedNoteView({ note }: { note: NoteRead }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Folder path for the FileBreadcrumb. useFolderPath reads from the file tree cache.
  const folderPath = useFolderPath(note.folderId);

  const title = displayTitle(note.title, t);

  const { restoreItem, isRestoring, hardDeleteItem, isHardDeleting } = useTrashMutations();
  const target = { kind: 'note', id: note.id } as const;

  function handleRestore(): void {
    restoreItem(target, {
      // Refetch the note so the page switches from read-only to editable.
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: fileQueryKeys.note(note.id) }),
    });
  }

  function handleHardDelete(): void {
    hardDeleteItem(target, {
      onSuccess: () => {
        // Leave the page first: it shows a note that no longer exists.
        router.replace(Routes.TRASH);
        // The note is gone for good: drop it from the cache, do not refetch it.
        queryClient.removeQueries({ queryKey: fileQueryKeys.note(note.id) });
      },
    });
  }

  const { isDesktop, isFullWidth, toggleWidth } = useNoteColumn();

  useBreadcrumb(title, undefined, folderPathHref(folderPath));
  // No rename and no move for a trashed note.
  const headerLead = useMemo(
    () => (
      <FileBreadcrumb
        path={folderPath}
        current={{ kind: 'note', id: note.id, name: note.title, parentId: note.folderId }}
        renameDisabled
      />
    ),
    [folderPath, note.id, note.title, note.folderId]
  );
  usePageLead(headerLead, true);
  const headerActions = useMemo(
    () => (isDesktop ? <NoteWidthToggle isFullWidth={isFullWidth} onToggle={toggleWidth} /> : undefined),
    [isDesktop, isFullWidth, toggleWidth]
  );
  usePageActions(headerActions);

  return (
    <div className="flex h-full flex-col">
      {/* Scrolls at the page edge: the layout padding moves inside (see `pageBleed`). */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', pageBleed.all)}>
        <div className={cn(noteColumnClass(isFullWidth), 'pb-24')}>
          <p className="note-title w-full text-foreground/60 p-0">{title}</p>

          <div className="mt-4 mb-6">
            <TrashedBanner
              message={t('notes.in_trash_banner')}
              itemName={title}
              onRestore={handleRestore}
              onDelete={handleHardDelete}
              isRestoring={isRestoring}
              isDeleting={isHardDeleting}
            />
          </div>

          <LazyRichNoteEditor editable={false} initialContent={note.content ?? ''} />
        </div>
      </div>
    </div>
  );
}
