'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, MoreHorizontal, NotepadText, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { type FolderRead, type NoteRead } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sdk } from '@/lib/apiClient';
import { formatShortDate } from '@/lib/format';
import { folderHref, noteHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

import { RenameFolderDialog } from './FolderNameDialog';
import { MoveDialog } from './MoveDialog';

type Props = {
  currentFolderId: string | null;
};

export function FilesList({ currentFolderId }: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { data: contentsRes, isLoading } = useQuery({
    queryKey: ['folders', 'contents', currentFolderId],
    queryFn: () => sdk.foldersContents({ query: { folder_id: currentFolderId } }),
  });

  const folders = contentsRes?.data?.folders ?? [];
  const notes = contentsRes?.data?.notes ?? [];
  const isEmpty = !isLoading && folders.length === 0 && notes.length === 0;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</div>;
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Folder className="size-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {currentFolderId ? t('files.empty_folder') : t('files.empty_root')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {folders.map(folder => (
        <FolderRow
          key={folder.id}
          folder={folder}
          onDelete={() => {
            void queryClient.invalidateQueries({ queryKey: ['folders'] });
          }}
        />
      ))}
      {notes.map(note => (
        <NoteRow
          key={note.id}
          note={note}
          onMoved={() => {
            void queryClient.invalidateQueries({ queryKey: ['folders', 'contents'] });
            void queryClient.invalidateQueries({ queryKey: ['notes'] });
          }}
        />
      ))}
    </div>
  );
}

// ─── Folder row ───────────────────────────────────────────────────────────────

type FolderRowProps = {
  folder: FolderRead;
  onDelete: () => void;
};

function FolderRow({ folder, onDelete }: FolderRowProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: previewRes } = useQuery({
    queryKey: ['folders', folder.id, 'delete-preview'],
    queryFn: () => sdk.foldersDeletePreview({ path: { folder_id: folder.id } }),
    enabled: deleteOpen,
  });
  const preview = previewRes?.data;

  const { mutate: restoreFolder } = useMutation({
    mutationFn: (id: string) => sdk.trashRestore({ path: { kind: 'folder', item_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  const { mutate: deleteFolder, isPending: isDeleting } = useMutation({
    mutationFn: () => sdk.foldersDelete({ path: { folder_id: folder.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      const folderId = folder.id;
      toast.success(t('files.folder_moved_to_trash'), {
        action: { label: t('common.undo'), onClick: () => restoreFolder(folderId) },
      });
      onDelete();
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_delete_folder'))),
  });

  const { mutate: moveFolder, isPending: isMoving } = useMutation({
    mutationFn: (targetFolderId: string | null) =>
      sdk.foldersUpdate({ path: { folder_id: folder.id }, body: { parentId: targetFolderId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(t('files.moved'));
      setMoveOpen(false);
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_move'))),
  });

  return (
    <>
      <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-foreground/10 bg-card hover:bg-accent/30 transition-colors">
        <Folder className="size-5 shrink-0 text-muted-foreground" />
        <Link href={folderHref(folder)} className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{folder.name}</p>
          <p className="text-xs text-muted-foreground">{formatShortDate(folder.updatedAt)}</p>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="opacity-0 group-hover:opacity-100 shrink-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              <Pencil className="size-4 mr-2" />
              {t('files.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMoveOpen(true)}>
              <Folder className="size-4 mr-2" />
              {t('files.move')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4 mr-2" />
              {t('files.move_to_trash')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RenameFolderDialog open={renameOpen} onOpenChange={setRenameOpen} folder={folder} />

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        movingFolderId={folder.id}
        currentParentId={folder.parentId}
        isPending={isMoving}
        onConfirm={moveFolder}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={<span />}
        title={t('files.move_folder_to_trash')}
        description={
          preview
            ? t('files.move_folder_to_trash_confirm', {
                folderCount: preview.folderCount,
                noteCount: preview.noteCount,
              })
            : '…'
        }
        confirmLabel={t('files.move_to_trash')}
        disableConfirm={isDeleting}
        onConfirm={() => deleteFolder()}
      />
    </>
  );
}

// ─── Note row ─────────────────────────────────────────────────────────────────

type NoteRowProps = {
  note: NoteRead;
  onMoved: () => void;
};

function NoteRow({ note, onMoved }: NoteRowProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutate: restoreNote } = useMutation({
    mutationFn: (id: string) => sdk.trashRestore({ path: { kind: 'note', item_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  const { mutate: deleteNote, isPending: isDeleting } = useMutation({
    mutationFn: () => sdk.notesDelete({ path: { note_id: note.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders', 'contents'] });
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      const noteId = note.id;
      toast.success(t('files.note_moved_to_trash'), {
        action: { label: t('common.undo'), onClick: () => restoreNote(noteId) },
      });
    },
    onError: err => toast.error(getErrorDetail(err, t('notes.failed_to_delete'))),
  });

  const { mutate: moveNote, isPending: isMoving } = useMutation({
    mutationFn: (folderId: string | null) => sdk.notesMove({ path: { note_id: note.id }, body: { folderId } }),
    onSuccess: res => {
      void queryClient.setQueryData(['notes', note.id], res);
      void queryClient.invalidateQueries({ queryKey: ['folders', 'contents'] });
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(t('files.note_moved'));
      setMoveOpen(false);
      onMoved();
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_move_note'))),
  });

  const title = note.title.trim() || t('notes.untitled');

  return (
    <>
      <div
        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-foreground/10 bg-card hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => router.push(noteHref(note))}
      >
        <NotepadText className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{title}</p>
          <p className="text-xs text-muted-foreground">{formatShortDate(note.updatedAt)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="opacity-0 group-hover:opacity-100 shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
      </div>

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentParentId={note.folderId}
        isPending={isMoving}
        onConfirm={moveNote}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={<span />}
        title={t('notes.move_to_trash_title')}
        description={t('notes.move_to_trash_confirm', { title: note.title.trim() || t('notes.untitled') })}
        confirmLabel={t('files.move_to_trash')}
        disableConfirm={isDeleting}
        onConfirm={() => deleteNote()}
      />
    </>
  );
}
