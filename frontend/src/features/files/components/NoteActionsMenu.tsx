'use client';

import { Eye, Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type NoteRead } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { MoveDialog } from './MoveDialog';
import { ROW_ACTION_CLASS } from './rowActions';

type Props = {
  note: NoteRead;
  /** Starts inline rename in the row. */
  onStartRename: () => void;
  /** Opens the preview panel for this note. */
  onPreview: (noteId: string) => void;
  onTrash: (noteId: string) => void;
  isTrashingNote?: boolean;
  moveNote: (args: { id: string; folderId: string | null }) => void;
  isMovingNote: boolean;
};

export function NoteActionsMenu({
  note,
  onStartRename,
  onPreview,
  onTrash,
  isTrashingNote,
  moveNote,
  isMovingNote,
}: Props) {
  const t = useTranslations();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const title = note.title.trim() || t('notes.untitled');

  return (
    <>
      {/* Eye (preview) button, next to the dropdown */}
      <Button
        variant="ghost"
        size="icon-sm"
        className={ROW_ACTION_CLASS}
        onClick={e => {
          e.stopPropagation();
          onPreview(note.id);
        }}
        tooltip={t('files.preview')}
        aria-label={t('files.preview')}
      >
        <Eye className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('files.item_actions')}
            className={ROW_ACTION_CLASS}
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation();
              onStartRename();
            }}
          >
            <Pencil className="size-4 mr-2" />
            {t('files.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation();
              setMoveOpen(true);
            }}
          >
            <Folder className="size-4 mr-2" />
            {t('files.move')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4 mr-2" />
            {t('files.move_to_trash')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentParentId={note.folderId}
        isPending={isMovingNote}
        onConfirm={folderId => {
          moveNote({ id: note.id, folderId });
          setMoveOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={<span />}
        title={t('notes.move_to_trash_title')}
        description={t('notes.move_to_trash_confirm', { title })}
        confirmLabel={t('files.move_to_trash')}
        disableConfirm={isTrashingNote}
        onConfirm={() => {
          onTrash(note.id);
          setDeleteOpen(false);
        }}
      />
    </>
  );
}
