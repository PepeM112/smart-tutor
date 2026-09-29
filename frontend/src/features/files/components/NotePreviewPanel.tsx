'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { RichNoteEditor } from '@/features/notes/editor/RichNoteEditor';
import { sdk } from '@/lib/apiClient';
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
 *
 * The header stays fixed; only the body scrolls. The body crossfades (120ms opacity)
 * when the previewed note changes. No fade on mount: SplitPane already fades the panel in.
 */
export function NotePreviewPanel({ noteId, onClose }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const prefersReduced = useReducedMotion();

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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — stays put when the note changes; only the body crossfades. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {note?.title.trim() || t('notes.untitled')}
        </p>
        <Button variant="ghost" size="sm" onClick={() => note && router.push(noteHref(note))} disabled={!note}>
          {t('files.open')}
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('files.close_preview')}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Body — crossfades when noteId changes (mode="wait": old fades out, new fades in). */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={noteId}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.12 }}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
