'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { PreviewPanelFrame } from '@/components/shared/PreviewPanelFrame';
import { QueryState } from '@/components/shared/QueryState';
import { FavoriteButton } from '@/features/notes/components/FavoriteButton';
import { RichNoteEditor } from '@/features/notes/editor/RichNoteEditor';
import { sdk } from '@/lib/apiClient';
import { displayTitle } from '@/lib/displayTitle';
import { noteHref } from '@/lib/routes';

import { fileQueryKeys } from '../lib/queryKeys';

type Props = {
  noteId: string;
  onClose: () => void;
};

/**
 * Read-only preview of a note, rendered in the SplitPane right pane or a mobile Drawer.
 * Keyed by `noteId + updatedAt` so the editor remounts when a different note is shown.
 * No autosave, no AI actions — editable={false}.
 */
export function NotePreviewPanel({ noteId, onClose }: Props) {
  const t = useTranslations();

  const {
    data: noteRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: fileQueryKeys.note(noteId),
    queryFn: () => sdk.notesGet({ path: { note_id: noteId } }),
  });

  const note = noteRes?.data;

  return (
    <PreviewPanelFrame
      title={displayTitle(note?.title, t)}
      openHref={note ? noteHref(note) : undefined}
      headerActions={<FavoriteButton noteId={noteId} fallbackIsFavorite={note?.isFavorite} />}
      onClose={onClose}
      contentKey={noteId}
    >
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('notes.failed_to_load_note')}>
        {/* Key remounts the editor when a different note or version is shown. */}
        {note && (
          <RichNoteEditor
            key={`${note.id}-${String(note.updatedAt)}`}
            editable={false}
            initialContent={note.content ?? ''}
          />
        )}
      </QueryState>
    </PreviewPanelFrame>
  );
}
