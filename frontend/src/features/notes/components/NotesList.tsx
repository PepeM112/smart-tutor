'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Bot, Download, Pencil, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { NoteSource, type NoteRead, type FolderRead } from '@/client';
import { DataTable, type MobileAction } from '@/components/shared/DataTable';
import { type SortDirection, type SortState } from '@/components/shared/SortableHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sdk } from '@/lib/apiClient';
import { formatShortDate } from '@/lib/format';
import { folderHref, noteHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

type Props = {
  data: NoteRead[];
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
};

/** A new note has an empty title (the editor shows "Untitled" only as a placeholder). */
function useNoteTitle(): (note: NoteRead) => string {
  const t = useTranslations();
  return note => note.title.trim() || t('notes.untitled');
}

export function NotesList({ data, sort, onSort }: Props) {
  const t = useTranslations();
  const noteTitle = useNoteTitle();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: foldersRes } = useQuery({
    queryKey: ['folders'],
    queryFn: () => sdk.foldersList(),
  });
  const folders = useMemo(() => foldersRes?.data ?? [], [foldersRes]);

  const { mutate: restoreNote } = useMutation({
    mutationFn: (id: string) => sdk.trashRestore({ path: { kind: 'note', item_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  const { mutate: deleteNote, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => sdk.notesDelete({ path: { note_id: id } }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success(t('notes.note_moved_to_trash'), {
        action: { label: t('common.undo'), onClick: () => restoreNote(id) },
      });
    },
    onError: () => toast.error(t('notes.failed_to_delete')),
  });

  const columns = useNotesColumns({ deleteNote, isDeleting, folders });

  const renderPreview = useCallback(
    (note: NoteRead) => (
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{noteTitle(note)}</p>
      </div>
    ),
    [noteTitle]
  );

  const renderActions = useCallback(
    (note: NoteRead): MobileAction[] => [
      {
        label: t('common.edit'),
        icon: Pencil,
        onClick: () => router.push(noteHref(note)),
      },
      {
        label: t('common.export'),
        icon: Download,
        onClick: () => {
          downloadMarkdown(noteTitle(note), note.content ?? '');
          toast.success(t('common.downloaded'));
        },
      },
      {
        label: t('files.move_to_trash'),
        icon: Trash2,
        onClick: () => deleteNote(note.id),
        confirm: {
          title: t('notes.move_to_trash_title'),
          description: t('notes.move_to_trash_confirm', { title: noteTitle(note) }),
        },
      },
    ],
    [t, router, deleteNote, noteTitle]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      sort={sort}
      onSort={onSort}
      emptyMessage={t('notes.no_notes_yet')}
      onRowClick={row => router.push(noteHref(row))}
      renderPreview={renderPreview}
      expandable={false}
      renderActions={renderActions}
    />
  );
}

function downloadMarkdown(title: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9-_ ]/g, '')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function SourceBadge({ source }: { source: NoteSource }) {
  const t = useTranslations();
  const isAI = source === NoteSource.AI_GENERATED;
  const Icon = isAI ? Bot : User;
  const label = isAI ? t('notes.source_ai') : t('notes.source_manual');

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

type ColumnDeps = {
  deleteNote: (id: string) => void;
  isDeleting: boolean;
  folders: FolderRead[];
};

function useNotesColumns({ deleteNote, isDeleting, folders }: ColumnDeps): ColumnDef<NoteRead, unknown>[] {
  const t = useTranslations();
  const noteTitle = useNoteTitle();
  const router = useRouter();
  const folderMap = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);

  return [
    {
      accessorKey: 'title',
      header: t('notes.column_title'),
      meta: { sortKey: 'title' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{noteTitle(row.original)}</p>
        </div>
      ),
    },
    {
      id: 'folder',
      header: t('files.folder_column'),
      cell: ({ row }) => {
        const folder = row.original.folderId ? folderMap.get(row.original.folderId) : null;
        if (!folder) return <span className="text-sm text-muted-foreground">{t('files.no_folder')}</span>;
        return (
          <Link
            href={folderHref(folder)}
            className="text-sm text-foreground hover:underline truncate max-w-[140px] block"
            onClick={e => e.stopPropagation()}
          >
            {folder.name}
          </Link>
        );
      },
    },
    {
      id: 'source',
      header: t('notes.column_source'),
      cell: ({ row }) => <SourceBadge source={row.original.source} />,
    },
    {
      id: 'updated',
      header: t('notes.column_updated'),
      meta: { sortKey: 'updated_at' },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatShortDate(row.original.updatedAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={t('common.edit')}
            onClick={e => {
              e.stopPropagation();
              router.push(noteHref(row.original));
            }}
            aria-label={t('common.edit')}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={t('common.export')}
            onClick={e => {
              e.stopPropagation();
              downloadMarkdown(noteTitle(row.original), row.original.content ?? '');
              toast.success(t('common.downloaded'));
            }}
            aria-label={t('common.export')}
          >
            <Download className="size-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-lg"
                tooltip={t('files.move_to_trash')}
                onClick={e => e.stopPropagation()}
                disabled={isDeleting}
                aria-label={t('files.move_to_trash')}
              >
                <Trash2 className="size-4" />
              </Button>
            }
            title={t('notes.move_to_trash_title')}
            description={t('notes.move_to_trash_confirm', { title: noteTitle(row.original) })}
            confirmLabel={t('files.move_to_trash')}
            onConfirm={() => deleteNote(row.original.id)}
          />
        </div>
      ),
    },
  ];
}
