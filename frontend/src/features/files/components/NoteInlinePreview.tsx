'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, FolderInput, NotepadText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { type FileTreeNote } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import {
  TREE_INDENT_STEP_PX,
  TREE_NAME_OFFSET_PX,
  TREE_ROW_BASE_PADDING_PX,
} from '@/components/shared/tree/treeLayout';
import { Button } from '@/components/ui/button';
import { LazyRichNoteEditor } from '@/features/notes/editor/LazyRichNoteEditor';
import { sdk } from '@/lib/apiClient';
import { noteHref } from '@/lib/routes';

import { useFilesTree } from '../context/FilesTreeContext';
import { fileQueryKeys } from '../lib/queryKeys';

import { MoveDialog } from './MoveDialog';

interface NoteInlinePreviewProps {
  note: FileTreeNote;
  depth: number;
}

/** The read-only preview that opens under a note row. It loads the note when it opens. */
export function NoteInlinePreview({ note, depth }: NoteInlinePreviewProps) {
  const t = useTranslations();
  const { mutations } = useFilesTree();
  const [moveOpen, setMoveOpen] = useState(false);
  const moveButtonRef = useRef<HTMLButtonElement>(null);

  const {
    data: noteRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: fileQueryKeys.note(note.id),
    queryFn: () => sdk.notesGet({ path: { note_id: note.id } }),
  });
  const fullNote = noteRes?.data;

  return (
    <div
      role="row"
      aria-level={depth + 1}
      className="bg-muted pt-1 pr-4 pb-4"
      style={{ paddingLeft: `${depth * TREE_INDENT_STEP_PX + TREE_ROW_BASE_PADDING_PX + TREE_NAME_OFFSET_PX}px` }}
    >
      <div role="gridcell" className="space-y-3">
        <div className="max-h-64 overflow-y-auto rounded-md border border-hairline bg-card p-3">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            errorMessage={t('notes.failed_to_load_note')}
            className="min-h-16"
          >
            {fullNote && (
              <LazyRichNoteEditor
                key={`${fullNote.id}-${String(fullNote.updatedAt)}`}
                editable={false}
                initialContent={fullNote.content ?? ''}
              />
            )}
          </QueryState>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fullNote && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {fullNote.isIndexed && <Check aria-hidden className="size-3.5 text-feedback-correct" />}
              {fullNote.isIndexed ? t('files.indexed_for_ai') : t('files.not_indexed_for_ai')}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button ref={moveButtonRef} variant="outline" icon={FolderInput} onClick={() => setMoveOpen(true)}>
              {t('files.move')}
            </Button>
            <Button variant="outline" icon={NotepadText} asChild>
              <Link href={noteHref({ id: note.id, title: note.title })}>{t('files.open_note')}</Link>
            </Button>
          </div>
        </div>
      </div>
      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentParentId={note.folderId}
        isPending={mutations.isMovingNote}
        onConfirm={targetId => {
          mutations.moveNote({ id: note.id, folderId: targetId });
          setMoveOpen(false);
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          moveButtonRef.current?.focus();
        }}
      />
    </div>
  );
}
